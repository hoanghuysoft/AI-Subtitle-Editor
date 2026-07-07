import { useState, useEffect, useRef } from "react";
import SrtHeader from "./components/SrtHeader";
import SrtUploadZone from "./components/SrtUploadZone";
import TranslationSettings from "./components/TranslationSettings";
import SrtBlockRow from "./components/SrtBlockRow";
import SrtAppendModal from "./components/SrtAppendModal";
import { SubtitleBlock } from "./types";
import { parseSRT, stringifySRT, timecodeToMs, msToTimecode } from "./utils/srtParser";
import { 
  FileText, 
  Download, 
  Check, 
  HelpCircle, 
  Info, 
  X, 
  AlertCircle, 
  Moon, 
  Search, 
  SlidersHorizontal,
  Clock,
  RotateCcw,
  Settings,
  Play,
  Pause,
  AlertTriangle,
  Globe,
  Cpu,
  Key,
  Sparkles,
  Undo,
  Redo
} from "lucide-react";

const TRIAL_SRT = `1
00:00:12,400 --> 00:00:15,100
Cooper, get the hell back to the module! We are running out of time.

2
00:00:15,800 --> 00:00:19,200
No, damn it! I won't just stand here and watch her die in the dust.

3
00:00:19,900 --> 00:02:23,100
This is no time for your damn theories. It's binary, yes or no.

4
00:00:24,000 --> 00:00:27,500
Science is about admitting what we don't know, not playing god.

5
00:00:28,100 --> 00:00:31,400
Go, get out of there, you crazy magnificent bastard!`;

export default function App() {
  const [fileName, setFileName] = useState<string>("");
  const [blocks, setBlocks] = useState<SubtitleBlock[]>([]);

  // History state vectors for Undo/Redo protocols
  const [past, setPast] = useState<{ blocks: SubtitleBlock[]; fileName: string }[]>([]);
  const [future, setFuture] = useState<{ blocks: SubtitleBlock[]; fileName: string }[]>([]);
  const lastHistoryPushTimeRef = useRef<number>(0);

  const [service, setService] = useState<string>("gemini");
  const [sourceLanguage, setSourceLanguage] = useState<string>(() => localStorage.getItem("srt_source_language") || "Auto-Detect");
  const [targetLanguage, setTargetLanguage] = useState<string>(() => localStorage.getItem("srt_target_language") || "Japanese");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3.5-flash");
  const [customInstructions, setCustomInstructions] = useState<string>(
    "Ensure colloquialisms and emotions are preserved without censorship. Match natural native dialogue pacing."
  );
  const [chunkSize, setChunkSize] = useState<number>(25);
  const [userGeminiApiKey, setUserGeminiApiKey] = useState<string>(() => localStorage.getItem("gemini_api_key") || "");
  const [userOpenRouterApiKey, setUserOpenRouterApiKey] = useState<string>(() => localStorage.getItem("openrouter_api_key") || "");
  
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("all"); // all, pending, translating, done, failed

  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAppendOpen, setIsAppendOpen] = useState<boolean>(false);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<"translated" | "bilingual" | "bilingual-reverse">("bilingual");
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Cancellation reference to pause processing gracefully between batches
  const cancellationRef = useRef<boolean>(false);

  // Active fetch controllers for each block to allow individual cancellation/aborting
  const activeControllersRef = useRef<Map<number, AbortController>>(new Map());

  // Tracks block IDs which are manually canceled/rerun to differentiate from other batch errors
  const manuallyCanceledBlockIdsRef = useRef<Set<number>>(new Set());

  // Auto scroll table reference
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Session tracking to prevent infinite retries of failed blocks during the same bulk run
  const attemptedBlockIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (isTranslating) {
      attemptedBlockIdsRef.current.clear();
    }
  }, [isTranslating]);

  useEffect(() => {
    cancellationRef.current = !isTranslating;
  }, [isTranslating]);

  // Load a file's subtitle blocks
  const handleFileLoaded = (name: string, content: string) => {
    try {
      const parsed = parseSRT(content);
      if (parsed.length === 0) {
        throw new Error("Could not find any valid subtitle frames in the SRT file.");
      }
      handleForcePushToHistory();
      setBlocks(parsed);
      setFileName(name);
      setGlobalError(null);
    } catch (err: any) {
      setGlobalError(err?.message || "Invalid or empty SRT file.");
    }
  };

  // Load Trial Multilingual SRT
  const handleLoadSample = () => {
    handleFileLoaded("Interstellar_Dialogue_Sample.srt", TRIAL_SRT);
  };

  // Handle manual translation edit
  const handleBlockTextUpdate = (id: number, text: string) => {
    pushToHistory({ blocks: blocksRef.current, fileName: fileNameRef.current }, false);
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, translatedText: text, status: "done" } : b))
    );
  };

  // Safe recursive chunk translation loop
  const translateNextBatch = async (currentBlocks: SubtitleBlock[]) => {
    if (cancellationRef.current) {
      setIsTranslating(false);
      return;
    }

    // Find the next set of pending or failed blocks
    const pendingBlocks = currentBlocks.filter(
      (b) => (b.status === "pending" || b.status === "failed") && !attemptedBlockIdsRef.current.has(b.id)
    );

    if (pendingBlocks.length === 0) {
      setIsTranslating(false);
      return;
    }

    // Take the first batch of chunkSize
    const batch = pendingBlocks.slice(0, chunkSize);
    const batchIds = batch.map((b) => b.id);

    // Update state to 'translating'
    setBlocks((prev) =>
      prev.map((b) => (batchIds.includes(b.id) ? { ...b, status: "translating", error: undefined, translationStartTime: Date.now() } : b))
    );

    const controller = new AbortController();
    batchIds.forEach((id) => {
      activeControllersRef.current.set(id, controller);
    });

    try {
      // API call (No standard automatic timeout - let it take as long as it requires)
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          blocks: batch.map((b) => ({ id: b.id, text: b.text })),
          sourceLanguage,
          targetLanguage,
          service,
          model: selectedModel,
          customInstructions,
          userGeminiApiKey: userGeminiApiKey || undefined,
          userOpenRouterApiKey: userOpenRouterApiKey || undefined,
        }),
      });

      batchIds.forEach((id) => {
        activeControllersRef.current.delete(id);
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || `HTTP ${response.status} Fail`);
      }

      const data = await response.json();
      const translations: { id: number; text: string }[] = data.translations || [];

      // Save state before batch updates
      handleForcePushToHistory();

      // Update blocks with matching translations using type-safe loose casting (Number comparison)
      setBlocks((prev) => {
        const updated = prev.map((b) => {
          if (batchIds.includes(b.id)) {
            const found = translations.find((t) => Number(t.id) === Number(b.id));
            if (found) {
              return {
                ...b,
                translatedText: found.text,
                status: "done" as const,
              };
            } else {
              // If returned list missed this block's index
              return {
                ...b,
                status: "failed" as const,
                error: "Index mapping mismatch from server response.",
              };
            }
          }
          return b;
        });

        // Trigger next chunk recursively with updated state
        setTimeout(() => translateNextBatch(updated), 200);
        return updated;
      });

    } catch (error: any) {
      batchIds.forEach((id) => {
        activeControllersRef.current.delete(id);
      });

      // If user paused translation, abort is expected: exit elegantly
      if (cancellationRef.current && (error?.name === "AbortError" || error?.message?.includes("aborted"))) {
        return;
      }

      console.error("Batch error details:", error);
      const isAbort = error?.name === "AbortError";
      const finalErrorMsg = error?.message || "Network Error";
      
      // Determine individual fates of blocks in this batch
      setBlocks((prev) => {
        const updated = prev.map((b) => {
          if (batchIds.includes(b.id)) {
            // If this block is currently being manually cancelled and rerun, ignore it here
            if (manuallyCanceledBlockIdsRef.current.has(b.id)) {
              manuallyCanceledBlockIdsRef.current.delete(b.id);
              return b;
            }

            // If the batch was aborted because a sister block was cancelled/rerun:
            // reset inoccent blocks back to "pending" so progress is continued without failures!
            if (isAbort) {
              return {
                ...b,
                status: "pending" as const,
                error: undefined,
              };
            }

            // Normal failure: Track failed batch ids in this session to prevent infinite batch loops
            attemptedBlockIdsRef.current.add(b.id);
            return {
              ...b,
              status: "failed" as const,
              error: finalErrorMsg
            };
          }
          return b;
        });
        
        // Continue translation of other blocks so it won't stop in the middle!
        if (!cancellationRef.current) {
          setTimeout(() => translateNextBatch(updated), 200);
        } else {
          setIsTranslating(false);
        }
        return updated;
      });
    }
  };

  // Start translated protocol
  const handleStart = () => {
    if (blocks.length === 0) return;
    setIsTranslating(true);
    cancellationRef.current = false;
    translateNextBatch(blocks);
  };

  // Pause translation
  const handlePause = () => {
    setIsTranslating(false);
    cancellationRef.current = true;
    activeControllersRef.current.forEach((controller) => {
      try {
        controller.abort();
      } catch (err) {
        console.error("Error aborting on pause", err);
      }
    });
    activeControllersRef.current.clear();
  };

  // Synchronize state values to refs for the keydown handler to prevent stale closures
  const pastRef = useRef(past);
  const futureRef = useRef(future);
  const blocksRef = useRef(blocks);
  const fileNameRef = useRef(fileName);
  const isTranslatingRef = useRef(isTranslating);

  useEffect(() => {
    pastRef.current = past;
    futureRef.current = future;
    blocksRef.current = blocks;
    fileNameRef.current = fileName;
    isTranslatingRef.current = isTranslating;
  }, [past, future, blocks, fileName, isTranslating]);

  const pushToHistory = (newPastState: { blocks: SubtitleBlock[]; fileName: string }, force: boolean = false) => {
    const now = Date.now();
    setPast((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        const isSame = JSON.stringify(last.blocks) === JSON.stringify(newPastState.blocks) && last.fileName === newPastState.fileName;
        if (isSame) {
          return prev;
        }
      }
      
      // Prevent keystroke flood unless force-pushed
      if (!force && (now - lastHistoryPushTimeRef.current < 1500)) {
        return prev;
      }
      
      lastHistoryPushTimeRef.current = now;
      const updated = [...prev, newPastState];
      if (updated.length > 50) {
        updated.shift();
      }
      return updated;
    });
    setFuture([]);
  };

  const handleForcePushToHistory = () => {
    pushToHistory({ blocks: blocksRef.current, fileName: fileNameRef.current }, true);
  };

  const handleUndo = () => {
    const p = pastRef.current;
    if (p.length === 0) return;
    
    const curBlocks = blocksRef.current;
    const curFileName = fileNameRef.current;
    
    const previous = p[p.length - 1];
    const newPast = p.slice(0, p.length - 1);
    
    setFuture((prev) => [{ blocks: curBlocks, fileName: curFileName }, ...prev]);
    setPast(newPast);
    
    if (isTranslatingRef.current) {
      handlePause();
    }
    
    setBlocks(previous.blocks);
    setFileName(previous.fileName);
  };

  const handleRedo = () => {
    const f = futureRef.current;
    if (f.length === 0) return;
    
    const curBlocks = blocksRef.current;
    const curFileName = fileNameRef.current;
    
    const next = f[0];
    const newFuture = f.slice(1);
    
    setPast((prev) => [...prev, { blocks: curBlocks, fileName: curFileName }]);
    setFuture(newFuture);
    
    if (isTranslatingRef.current) {
      handlePause();
    }
    
    setBlocks(next.blocks);
    setFileName(next.fileName);
  };

  // Keyboard binding for global Ctrl+Z / Ctrl+Y / Cmd+Z / Cmd+Shift+Z / Cmd+Y shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // Skip history shortcuts if focusing on global API setting entries so they can type normally
      if (activeElement && activeElement.tagName === "INPUT" && activeElement.id !== "search-input") {
        return;
      }

      const isZ = e.key.toLowerCase() === "z";
      const isY = e.key.toLowerCase() === "y";
      const isMetaOrCtrl = e.metaKey || e.ctrlKey;
      
      if (isMetaOrCtrl) {
        if (isZ) {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (isY) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Reset all
  const handleReset = () => {
    setIsTranslating(false);
    cancellationRef.current = true;
    handleForcePushToHistory();
    setBlocks((prev) =>
      prev.map((b) => ({
        ...b,
        translatedText: undefined,
        status: "pending",
        error: undefined,
      }))
    );
    setGlobalError(null);
  };

  // Retry specifically failed items
  const handleRetryFailed = () => {
    if (blocks.length === 0) return;
    setIsTranslating(true);
    cancellationRef.current = false;
    
    // Quick re-init loop specifically highlighting failed as translating first which will translate properly
    translateNextBatch(blocks);
  };

  // Retry/re-translate an individual row item with optional custom inline instructions for specific line context
  const handleSingleTranslate = async (id: number, inlineInstruction?: string) => {
    const blockToTranslate = blocks.find((b) => b.id === id);
    if (!blockToTranslate) return;

    // Save history snapshot before starting single re-translation
    handleForcePushToHistory();

    // Set targeted row state to translating
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "translating", error: undefined, translationStartTime: Date.now() } : b))
    );

    const controller = new AbortController();
    activeControllersRef.current.set(id, controller);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          blocks: [{ id: blockToTranslate.id, text: blockToTranslate.text }],
          sourceLanguage,
          targetLanguage,
          service,
          model: selectedModel,
          customInstructions: inlineInstruction 
            ? `${customInstructions ? customInstructions + ". " : ""}Specific block context directive: ${inlineInstruction}`
            : customInstructions,
          userGeminiApiKey: userGeminiApiKey || undefined,
          userOpenRouterApiKey: userOpenRouterApiKey || undefined,
        }),
      });

      activeControllersRef.current.delete(id);

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || `HTTP ${response.status} failed`);
      }

      const data = await response.json();
      const translations = data.translations || [];
      const found = translations.find((t: any) => Number(t.id) === Number(id));

      if (found) {
        setBlocks((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, translatedText: found.text, status: "done" } : b
          )
        );
      } else {
        throw new Error("Target response was empty.");
      }
    } catch (err: any) {
      activeControllersRef.current.delete(id);

      // If this block is currently being manually cancelled and rerun, ignore it here
      if (manuallyCanceledBlockIdsRef.current.has(id)) {
        return;
      }

      const isAbort = err?.name === "AbortError";
      const finalErrorMsg = err?.message || "Connection failed";
      
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, status: isAbort ? "pending" : "failed", error: isAbort ? undefined : finalErrorMsg }
            : b
        )
      );
    }
  };

  // Cancel any active translation for a block and rerun its translation immediately
  const handleCancelAndRerun = async (id: number) => {
    // 1. Abort any active controller associated with this block
    const controller = activeControllersRef.current.get(id);
    if (controller) {
      manuallyCanceledBlockIdsRef.current.add(id);
      controller.abort();
      activeControllersRef.current.delete(id);
    }

    // 2. Clear from failed attempts list in case it previously was marked as failed
    attemptedBlockIdsRef.current.delete(id);

    // 3. Fire a single re-translation immediately
    await handleSingleTranslate(id);
  };

  // Merge subtitle blocks (above or under directions)
  const handleMerge = (id: number, direction: "above" | "under") => {
    // Save history snapshot before merging
    handleForcePushToHistory();
    const currentIdx = blocks.findIndex((b) => b.id === id);
    if (currentIdx === -1) return;

    let aIdx = -1;
    let bIdx = -1;

    if (direction === "above") {
      if (currentIdx === 0) return; // No block above
      aIdx = currentIdx - 1;
      bIdx = currentIdx;
    } else {
      if (currentIdx === blocks.length - 1) return; // No block under
      aIdx = currentIdx;
      bIdx = currentIdx + 1;
    }

    const blockA = blocks[aIdx];
    const blockB = blocks[bIdx];

    const mergedText = `${blockA.text}\n${blockB.text}`;
    const mergedTranslation = 
      blockA.translatedText && blockB.translatedText
        ? `${blockA.translatedText}\n${blockB.translatedText}`
        : blockA.translatedText || blockB.translatedText || "";

    const mergedStatus = mergedTranslation.trim() ? "done" : "pending";

    const mergedBlock: SubtitleBlock = {
      id: blockA.id, // Will reindex anyway
      startTime: blockA.startTime,
      endTime: blockB.endTime,
      text: mergedText,
      translatedText: mergedTranslation || undefined,
      status: mergedStatus,
    };

    // Construct new array
    const newBlocks = [...blocks];
    newBlocks.splice(aIdx, 2, mergedBlock);

    // Re-index all blocks
    const reindexed = newBlocks.map((b, idx) => ({
      ...b,
      id: idx + 1,
    }));

    setBlocks(reindexed);
  };

  // Append subtitle piece below the current list
  const handleAppendSubtitles = (
    incomingBlocks: SubtitleBlock[],
    shouldOffset: boolean,
    gapSeconds: number
  ) => {
    // Save history snapshot before appending
    handleForcePushToHistory();
    if (blocks.length === 0) {
      setBlocks(incomingBlocks);
      return;
    }

    const lastBlock = blocks[blocks.length - 1];
    const lastEndTimeMs = timecodeToMs(lastBlock.endTime);
    // Determine offset in milliseconds
    const offsetMs = shouldOffset ? lastEndTimeMs + Math.round(gapSeconds * 1000) : 0;

    // Process and translate timestamps for the new blocks
    const adjustedNewBlocks: SubtitleBlock[] = incomingBlocks.map((incomingBlock) => {
      if (offsetMs > 0) {
        const blockStartMs = timecodeToMs(incomingBlock.startTime);
        const blockEndMs = timecodeToMs(incomingBlock.endTime);

        const newStartMs = blockStartMs + offsetMs;
        const newEndMs = blockEndMs + offsetMs;

        return {
          ...incomingBlock,
          startTime: msToTimecode(newStartMs),
          endTime: msToTimecode(newEndMs),
          status: "pending" as const, // Put into queue as pending translation
          translatedText: undefined,
          error: undefined,
        };
      } else {
        return {
          ...incomingBlock,
          status: "pending" as const, // Put into queue as pending translation
          translatedText: undefined,
          error: undefined,
        };
      }
    });

    // Merge them with currently loaded blocks
    const mergedList = [...blocks, ...adjustedNewBlocks];

    // Reindex all blocks continuously
    const reindexedList = mergedList.map((block, idx) => ({
      ...block,
      id: idx + 1,
    }));

    setBlocks(reindexedList);
    setFileName((prev) => (prev ? `${prev} + appended` : "appended_subtitles.srt"));
  };

  // Export SRT
  const handleExport = () => {
    if (blocks.length === 0) return;
    
    const content = stringifySRT(blocks, exportFormat);
    const blob = new Blob([content], { type: "text/srt;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const cleanOrigName = fileName.replace(/\.srt$/i, "");
    const newName = `${cleanOrigName}.${exportFormat}.${targetLanguage.toLowerCase().replace(/\s+/g, "_")}.srt`;
    
    const link = document.createElement("a");
    link.href = url;
    link.download = newName;
    document.body.appendChild(link);
    link.click();
    
    // clean residues
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Stats calculation
  const totalBlocks = blocks.length;
  const translatedCount = blocks.filter((b) => b.status === "done").length;
  const failedCount = blocks.filter((b) => b.status === "failed").length;
  const translatingCount = blocks.filter((b) => b.status === "translating").length;
  const progressPercent = totalBlocks > 0 ? (translatedCount / totalBlocks) * 100 : 0;

  // Filter list of rows based on matching input query or state
  const filteredBlocks = blocks.filter((b) => {
    const matchesSearch =
      b.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.translatedText && b.translatedText.toLowerCase().includes(searchQuery.toLowerCase())) ||
      String(b.id).includes(searchQuery);

    if (filterStatus === "all") return matchesSearch;
    return b.status === filterStatus && matchesSearch;
  });

  const showPaidModelFlow = () => {
    // Just a placeholder for when user selects paid, telling them to check workspace secrets
    setShowKeyModal(true);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0c0c0e] text-[#d1d1d1] font-sans transition-colors antialiased">
      
      {/* Universal header component with Sophisticated Dark visual cues */}
      <SrtHeader onShowKeyInfo={() => setShowKeyModal(true)} />

      {/* Main viewport Container */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden max-w-[1700px] w-full mx-auto p-4 md:p-6 gap-6">
        
        {/* Sidebar settings */}
        <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-6">
          
          {/* Condensed Minimal Control Center Panel */}
          <div className="bg-[#121215] border border-[#2a2a2e] rounded-xl p-5 flex flex-col gap-5 shadow-xl shadow-black/35">
            <div className="flex items-center justify-between border-b border-[#2a2a2e] pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-[#c4a67e]" />
                <h2 className="font-serif italic text-white text-md tracking-wider">Control Console</h2>
              </div>
              <div className="flex h-2 w-2 relative">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isTranslating ? 'bg-[#c4a67e]' : 'bg-[#88888e]'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isTranslating ? 'bg-[#c4a67e]' : 'bg-[#55555e]'}`}></span>
              </div>
            </div>

            {/* Config details summary widget */}
            <div className="bg-[#0c0c0e] border border-[#2a2a2e]/60 rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-[#88888e] flex items-center gap-1"><Globe className="h-3 w-3" /> Language Matrix</span>
                <span className="text-white font-bold">{sourceLanguage} ➔ <span className="text-[#c4a67e]">{targetLanguage}</span></span>
              </div>
              
              <div className="flex justify-between items-center text-[11px] border-t border-[#2a2a2e]/40 pt-2.5">
                <span className="text-[#88888e] flex items-center gap-1"><Sparkles className="h-3 w-3 text-amber-500" /> Active Model</span>
                <span className="text-[#d1d1d1] font-mono text-[10px] truncate max-w-[130px]" title={selectedModel}>{selectedModel}</span>
              </div>

              <div className="flex justify-between items-center text-[11px] border-t border-[#2a2a2e]/40 pt-2.5">
                <span className="text-[#88888e] flex items-center gap-1"><Key className="h-3 w-3 text-[#c4a67e]" /> Key Status</span>
                {service === "openrouter" ? (
                  userOpenRouterApiKey ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1 text-[9px]">● Client Key</span>
                  ) : (
                    <span className="text-amber-500 font-bold flex items-center gap-1 text-[9px]">● Missing OR Key</span>
                  )
                ) : (
                  userGeminiApiKey ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1 text-[9px]">● Client Key</span>
                  ) : (
                    <span className="text-[#c4a67e]/80 font-bold flex items-center gap-1 text-[9px]">● Server Default</span>
                  )
                )}
              </div>
            </div>

            {/* Primary Configuration Trigger */}
            <button
              id="open-settings-modal-btn"
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1c1c21] hover:bg-[#25252b] text-white border border-[#2a2a2e] hover:border-[#3a3a3f] font-bold text-xs uppercase tracking-wider transition-all cursor-pointer rounded-lg shadow-sm"
            >
              <Settings className="h-3.5 w-3.5 text-[#c4a67e] animate-spin-slow" />
              Configure Subtitle Engine
            </button>

            {/* Protocol Action triggers */}
            <div className="flex flex-col gap-2.5 pt-4 border-t border-[#2a2a2e]">
              <div className="flex gap-2">
                {isTranslating ? (
                  <button
                    id="pause-translate-btn"
                    type="button"
                    onClick={handlePause}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-widest transition-all cursor-pointer rounded-md shadow-md"
                    disabled={blocks.length === 0}
                  >
                    <Pause className="h-4 w-4" />
                    Pause
                  </button>
                ) : (
                  <button
                    id="start-translate-btn"
                    type="button"
                    onClick={handleStart}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 text-black bg-[#c4a67e] hover:bg-[#d4ba94] font-bold text-xs uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#c4a67e]/10 cursor-pointer rounded-md"
                    disabled={blocks.length === 0 || (totalBlocks > 0 && translatedCount === totalBlocks)}
                  >
                    <Play className="h-4 w-4" />
                    {translatedCount > 0 ? "Resume" : "Start Translation"}
                  </button>
                )}

                <button
                  id="undo-btn"
                  type="button"
                  onClick={handleUndo}
                  disabled={past.length === 0}
                  className="px-3 py-3 bg-[#1c1c21] border border-[#2a2a2e] hover:bg-[#25252b] text-[#88888e] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer rounded-md"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo className="h-4 w-4" />
                </button>

                <button
                  id="redo-btn"
                  type="button"
                  onClick={handleRedo}
                  disabled={future.length === 0}
                  className="px-3 py-3 bg-[#1c1c21] border border-[#2a2a2e] hover:bg-[#25252b] text-[#88888e] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer rounded-md"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo className="h-4 w-4" />
                </button>

                <button
                  id="reset-translate-btn"
                  type="button"
                  onClick={handleReset}
                  className="px-3.5 py-3 bg-[#1c1c21] border border-[#2a2a2e] hover:bg-[#25252b] text-[#88888e] hover:text-white transition-all cursor-pointer rounded-md"
                  disabled={blocks.length === 0}
                  title="Reset Subtitles"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>

              {failedCount > 0 && !isTranslating && (
                <button
                  id="retry-failed-btn"
                  type="button"
                  onClick={handleRetryFailed}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900 border border-rose-800 text-rose-300 font-bold text-xs uppercase tracking-widest transition-all cursor-pointer rounded-md"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Retry Failed ({failedCount})
                </button>
              )}
            </div>
          </div>

          {/* Guidelines info card built insidesidebar to maintain screen order */}
          <div className="bg-[#121215] border border-[#2a2a2e] rounded-xl p-4 text-xs flex flex-col gap-3">
            <h4 className="font-bold text-white flex items-center gap-1.5 font-serif italic">
              <Info className="h-3.5 w-3.5 text-[#c4a67e]" /> Translation Protocol
            </h4>
            <div className="space-y-2 text-[#88888e] leading-relaxed">
              <p>
                <strong className="text-[#c4a67e]">Uncensored Accuracy:</strong> Dialog is protected from semantic editing or sanitization. Raw emotional context is retained completely.
              </p>
              <p>
                <strong className="text-[#c4a67e]">Timecodes Sync:</strong> Millisecond time stamps remain untouched. Compatible with all video playback engines formats.
              </p>
              <p>
                <strong className="text-[#c4a67e]">Side-by-Side:</strong> Export allows you to learn targeted languages with original screen references.
              </p>
            </div>
          </div>
        </aside>

        {/* Dynamic center / Subtitle view */}
        <main className="flex-1 flex flex-col bg-[#121215] border border-[#2a2a2e] rounded-xl overflow-hidden min-h-[500px]">
          
          {blocks.length === 0 ? (
            <div className="flex-1 flex flex-col justify-center items-center p-8 text-center bg-[#0c0c0e]/30">
              <div className="max-w-md flex flex-col items-center">
                <div className="w-12 h-12 rounded-lg bg-[#c4a67e]/10 border border-[#c4a67e]/30 flex items-center justify-center text-[#c4a67e] mb-4">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-serif italic text-white mb-2">No Subtitle File Loaded</h3>
                <p className="text-xs text-[#88888e] mb-6 leading-relaxed">
                  Provide an SRT file configuration to initialize the translation mapping. Try the trail set below if you'd like a live trial.
                </p>
                
                <SrtUploadZone
                  onFileLoaded={handleFileLoaded}
                  onLoadSample={handleLoadSample}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* File details context header */}
              <div className="p-4 md:p-5 border-b border-[#2a2a2e] bg-[#121215] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-serif italic text-white flex items-center gap-2">
                    Source: <span className="font-sans not-italic text-[#c4a67e] font-bold">{fileName}</span>
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-[10px] text-[#88888e] uppercase tracking-wider font-mono">
                    <span>{totalBlocks} Frames Loaded</span>
                    <span>•</span>
                    <span className="text-[#c4a67e]">{translatedCount} Done</span>
                    {translatingCount > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-amber-400 animate-pulse">{translatingCount} Translating</span>
                      </>
                    )}
                    {failedCount > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-rose-400">{failedCount} Failed</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Quick control actions for editing and ejecting files */}
                <div className="flex items-center gap-2">
                  <button
                    id="btn-append-file"
                    type="button"
                    onClick={() => setIsAppendOpen(true)}
                    className="text-xs font-bold text-white hover:text-white flex items-center gap-1.5 bg-[#25252b]/80 hover:bg-[#2e2e36] border border-[#c4a67e]/40 hover:border-[#c4a67e] px-3.5 py-1.5 rounded-sm transition cursor-pointer"
                    title="Append more subtitle blocks or cut pieces sequentially underneath"
                  >
                    <FileText className="h-3.5 w-3.5 text-[#c4a67e]" />
                    Append Subtitles
                  </button>
                  <button
                    id="btn-remove-file"
                    type="button"
                    onClick={() => {
                      handlePause();
                      setBlocks([]);
                      setFileName("");
                    }}
                    className="text-xs font-bold text-[#88888e] hover:text-white flex items-center gap-1 bg-[#1a1a1f] px-3 py-1.5 border border-[#2a2a2e] rounded-sm transition cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                    Eject File
                  </button>
                </div>
              </div>

              {/* Filtering / Search rail */}
              <div className="p-3 bg-[#0c0c0e]/80 border-b border-[#2a2a2e] flex flex-col sm:flex-row gap-3 items-center justify-between">
                
                {/* Search query input */}
                <div className="relative w-full sm:w-72">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#55555e]">
                    <Search className="h-3.5 w-3.5" />
                  </span>
                  <input
                    id="search-input"
                    type="text"
                    placeholder="Search dialogues or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-1.5 rounded bg-[#121215] border border-[#2a2a2e] text-[#d1d1d1] placeholder-[#55555e] focus:border-[#c4a67e] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#55555e] hover:text-white text-xs"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Filter and formatting presets */}
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#55555e] uppercase tracking-wider font-mono">Status:</span>
                    <select
                      id="status-filter-select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="text-[11px] bg-[#1a1a1f] border border-[#2a2a2e] text-[#d1d1d1] px-2.5 py-1 rounded"
                    >
                      <option value="all">All ({totalBlocks})</option>
                      <option value="pending">Pending ({blocks.filter(b => b.status === "pending").length})</option>
                      <option value="translating">Active ({blocks.filter(b => b.status === "translating").length})</option>
                      <option value="done">Done ({blocks.filter(b => b.status === "done").length})</option>
                      <option value="failed">Failed ({blocks.filter(b => b.status === "failed").length})</option>
                    </select>
                  </div>

                  <div className="h-4 w-[1px] bg-[#2a2a2e] hidden sm:block" />

                  {/* Format selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-[#55555e] uppercase tracking-wider font-mono">Format:</span>
                    <select
                      id="export-format-select"
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value as any)}
                      className="text-[11px] bg-[#1a1a1f] border border-[#2a2a2e] text-[#c4a67e] font-semibold px-2 py-1 rounded focus:outline-none"
                    >
                      <option value="translated">Translated Only</option>
                      <option value="bilingual">Bilingual (Orig + Trans)</option>
                      <option value="bilingual-reverse">Bilingual (Trans + Orig)</option>
                    </select>
                  </div>

                  {/* Export Trigger */}
                  <button
                    id="btn-export-srt"
                    onClick={handleExport}
                    disabled={translatedCount === 0}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold text-black bg-[#c4a67e] hover:bg-[#d4ba94] px-3.5 py-1.5 rounded transition disabled:opacity-35 disabled:cursor-not-allowed uppercase tracking-wider cursor-pointer"
                    title={translatedCount === 0 ? "Translate at least 1 block to export" : ""}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>
                </div>
              </div>

              {/* Subtitle Table viewport */}
              <div 
                ref={tableContainerRef}
                className="flex-1 overflow-y-auto max-h-[60vh] bg-[#0c0c0e]/40 divide-y divide-[#1a1a1e]"
              >
                {filteredBlocks.length === 0 ? (
                  <div className="p-12 text-center text-xs text-[#55555e]">
                    No subtitles match your filter selection.
                  </div>
                ) : (
                  filteredBlocks.map((block) => (
                    <SrtBlockRow
                      key={block.id}
                      block={block}
                      onTextUpdate={handleBlockTextUpdate}
                      onSingleTranslate={handleSingleTranslate}
                      onCancelAndRerun={handleCancelAndRerun}
                      onMergeAbove={(id) => handleMerge(id, "above")}
                      onMergeUnder={(id) => handleMerge(id, "under")}
                      isFirst={block.id === 1}
                      isLast={block.id === blocks[blocks.length - 1]?.id}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* API Key instruction info modal */}
      {showKeyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#121215] border border-[#2a2a2e] w-full max-w-lg rounded-xl overflow-hidden shadow-2xl p-6 relative flex flex-col gap-4 text-left">
            <button
              onClick={() => setShowKeyModal(false)}
              className="absolute top-4 right-4 text-[#55555e] hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-serif italic text-lg text-white tracking-wide flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-md"></span>
              Secure API Integration Details
            </h3>

            <div className="text-xs text-[#88888e] leading-relaxed space-y-3">
              <p>
                Linguist Gemini communicates directly with your personal, secure AI Studio workspace. 
                Any request is processed entirely server-side, protecting system integrity!
              </p>
              
              <div className="bg-[#0c0c0e] border border-[#2a2a2e] p-3 rounded space-y-2 font-mono text-[11px] text-[#d1d1d1]">
                <div className="flex justify-between">
                  <span>VARIABLE NAME:</span>
                  <span className="text-[#c4a67e] font-semibold">GEMINI_API_KEY</span>
                </div>
                <div className="flex justify-between">
                  <span>SCOPE / VISIBILITY:</span>
                  <span className="text-emerald-400">Server Encrypted Only</span>
                </div>
                <div className="flex justify-between">
                  <span>STATUS:</span>
                  <span className="text-emerald-400">Configured and Live</span>
                </div>
              </div>

              <p>
                To provide your own billing key or override limits, add the key inside the 
                <strong className="text-white"> Secrets Panel </strong> on the top right Settings bar of Google AI Studio. 
                We automatically retrieve the key inside <code className="bg-[#1c1c21] px-1 py-0.5 rounded border border-[#2a2a2e]">process.env.GEMINI_API_KEY</code> lazily during runtime.
              </p>
            </div>

            <button
              onClick={() => setShowKeyModal(false)}
              className="mt-2 py-2.5 bg-[#c4a67e] text-black font-bold uppercase tracking-wider text-xs hover:bg-[#d4ba94] transition"
            >
              Acknowledge Credentials
            </button>
          </div>
        </div>
      )}

      {/* Foot banner stats dashboard exactly replicating Sophisticated Dark design specs */}
      <footer className="px-6 md:px-8 py-4 bg-[#121215] border-t border-[#2a2a2e] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full max-w-lg">
          <div className="text-[10px] uppercase tracking-widest text-[#88888e] whitespace-nowrap">Engine Output Progress</div>
          <div className="flex-1 h-1.5 bg-[#1c1c21] rounded-full overflow-hidden border border-[#232328]">
            <div 
              className="h-full bg-gradient-to-r from-[#8c7851] to-[#c4a67e] transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <div className="text-[10px] font-mono text-[#c4a67e] font-bold">
            {progressPercent.toFixed(1)}% ({translatedCount}/{totalBlocks || 0})
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="text-[10px] text-[#55555e] uppercase tracking-widest flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#c4a67e]"></span>
            Uncensored Accuracy Mode <span className="text-emerald-400 font-semibold ml-1">[ON]</span>
          </div>
          <div className="h-4 w-[1px] bg-[#3a3a3f] hidden sm:block"></div>
          <div className="text-[10px] text-[#55555e] uppercase tracking-widest italic font-serif">
            Preserving ISO-8859-1 Timing Alignment
          </div>
        </div>
      </footer>

      {/* Translation Settings Modal */}
      <TranslationSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        service={service}
        setService={setService}
        sourceLanguage={sourceLanguage}
        setSourceLanguage={setSourceLanguage}
        targetLanguage={targetLanguage}
        setTargetLanguage={setTargetLanguage}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        customInstructions={customInstructions}
        setCustomInstructions={setCustomInstructions}
        chunkSize={chunkSize}
        setChunkSize={setChunkSize}
        userGeminiApiKey={userGeminiApiKey}
        setUserGeminiApiKey={setUserGeminiApiKey}
        userOpenRouterApiKey={userOpenRouterApiKey}
        setUserOpenRouterApiKey={setUserOpenRouterApiKey}
      />

      {/* Srt Append Modal */}
      <SrtAppendModal
        isOpen={isAppendOpen}
        onClose={() => setIsAppendOpen(false)}
        lastBlockEndTime={blocks[blocks.length - 1]?.endTime || "00:00:00,000"}
        onAppend={handleAppendSubtitles}
      />
    </div>
  );
}
