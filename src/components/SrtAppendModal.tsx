import { useState, ChangeEvent, useRef, DragEvent } from "react";
import { X, Upload, Clock, Sliders, FileCheck, HelpCircle, ArrowDown } from "lucide-react";
import { parseSRT, timecodeToMs, msToTimecode } from "../utils/srtParser";
import { SubtitleBlock } from "../types";

interface SrtAppendModalProps {
  isOpen: boolean;
  onClose: () => void;
  lastBlockEndTime: string;
  onAppend: (newBlocks: SubtitleBlock[], shouldOffset: boolean, gapSeconds: number) => void;
}

export default function SrtAppendModal({
  isOpen,
  onClose,
  lastBlockEndTime,
  onAppend,
}: SrtAppendModalProps) {
  const [activeTab, setActiveTab] = useState<"upload" | "paste">("upload");
  const [srtText, setSrtText] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsedBlocks, setParsedBlocks] = useState<SubtitleBlock[]>([]);
  
  // Shifting parameters
  const [alignmentMode, setAlignmentMode] = useState<"continuous" | "absolute">("continuous");
  const [gapSeconds, setGapSeconds] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleTextChange = (text: string) => {
    setSrtText(text);
    setError(null);
    if (text.trim() === "") {
      setParsedBlocks([]);
      return;
    }
    try {
      const parsed = parseSRT(text);
      if (parsed.length > 0) {
        setParsedBlocks(parsed);
      } else {
        setParsedBlocks([]);
      }
    } catch {
      setParsedBlocks([]);
    }
  };

  const processFile = (file: File) => {
    if (!file.name.endsWith(".srt") && !file.name.endsWith(".txt")) {
      setError("Please select a valid subtitle file (.srt).");
      return;
    }
    setError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setSrtText(content);
        try {
          const parsed = parseSRT(content);
          if (parsed.length > 0) {
            setParsedBlocks(parsed);
          } else {
            setError("No valid subtitle blocks found in the file.");
            setParsedBlocks([]);
          }
        } catch (err: any) {
          setError(err?.message || "Error parsing SRT file.");
          setParsedBlocks([]);
        }
      }
    };
    reader.onerror = () => {
      setError("Error reading the file.");
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleSubmit = () => {
    if (parsedBlocks.length === 0) {
      setError("Please load or paste valid subtitle content first.");
      return;
    }

    onAppend(parsedBlocks, alignmentMode === "continuous", gapSeconds);
    
    // Reset states and close
    setSrtText("");
    setFileName("");
    setParsedBlocks([]);
    setError(null);
    onClose();
  };

  const currentDurationMs = timecodeToMs(lastBlockEndTime);
  const calculatedOffsetMs = currentDurationMs + gapSeconds * 1000;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
      <div 
        id="append-subtitles-modal"
        className="bg-[#121215] border border-[#2a2a2e] w-full max-w-2xl rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header decoration in standard Sophisticated Dark theme style */}
        <div className="p-5 border-b border-[#2a2a2e] flex items-center justify-between bg-[#121215]">
          <div className="flex items-center gap-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#c4a67e]" />
            <h3 className="font-serif italic text-white text-lg tracking-wider">
              Append Subtitle Piece
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#66666e] hover:text-white transition-colors cursor-pointer p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable contents */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 text-left">
          
          {/* Help box */}
          <div className="bg-[#121215] border border-[#c4a67e]/20 rounded-lg p-3.5 text-xs text-[#88888e] leading-relaxed flex items-start gap-2.5">
            <Clock className="h-4 w-4 text-[#c4a67e] shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[#c4a67e] mb-1">Timing & Sequence Consolidation Engine</p>
              Append extra frames underneath your current file. Ideal for multiple subtitle files cut from partitioned stream segments. Select how timestamps should shift to align them correctly.
            </div>
          </div>

          {/* Subtitle Source selector tab option */}
          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-widest text-[#88888e] font-bold">1/ Subtitle Inputs Source</label>
            <div className="flex border-b border-[#2a2a2e]">
              <button
                type="button"
                onClick={() => { setActiveTab("upload"); handleTextChange(""); }}
                className={`py-2 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
                  activeTab === "upload" 
                    ? "border-[#c4a67e] text-white" 
                    : "border-transparent text-[#55555e] hover:text-[#d1d1d1]"
                }`}
              >
                Upload SRT File
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab("paste"); handleTextChange(""); }}
                className={`py-2 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
                  activeTab === "paste" 
                    ? "border-[#c4a67e] text-white" 
                    : "border-transparent text-[#55555e] hover:text-[#d1d1d1]"
                }`}
              >
                Copy & Paste Raw SRT Block
              </button>
            </div>

            {activeTab === "upload" ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
                  isDragging 
                    ? "border-[#c4a67e] bg-[#c4a67e]/10" 
                    : "border-[#2a2a2e] hover:border-[#c4a67e]/55 bg-[#0c0c0e]"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".srt,.txt"
                  className="hidden"
                />
                <Upload className="h-8 w-8 text-[#88888e] mb-2" />
                {fileName ? (
                  <div className="text-center">
                    <span className="text-xs text-white font-semibold flex items-center gap-1.5 justify-center">
                      <FileCheck className="h-4 w-4 text-emerald-400" />
                      {fileName}
                    </span>
                    <span className="text-[10px] text-[#55555e] block mt-0.5">Click to switch files</span>
                  </div>
                ) : (
                  <p className="text-xs text-[#88888e] max-w-sm text-center font-sans">
                    Drag & drop your new SRT piece here, or click to browse files
                  </p>
                )}
              </div>
            ) : (
              <textarea
                value={srtText}
                onChange={(e) => handleTextChange(e.target.value)}
                rows={5}
                placeholder="1&#10;00:00:00,500 --> 00:00:04,200&#10;This is an appended dialogue segment line."
                className="w-full text-xs font-semibold font-mono p-3 rounded bg-[#0c0c0e] border border-[#2a2a2e] focus:border-[#c4a67e] focus:outline-none text-white leading-relaxed placeholder-[#3a3a3f]"
              />
            )}
          </div>

          {/* Parsed diagnostics badge summary */}
          {parsedBlocks.length > 0 && (
            <div className="bg-emerald-950/15 border border-emerald-900/40 text-emerald-400 rounded-lg p-3 flex items-center justify-between text-xs animate-fade-in font-sans">
              <span className="flex items-center gap-1.5">
                <FileCheck className="h-4 w-4 shrink-0" />
                Parsed successfully: <strong className="font-bold">{parsedBlocks.length} subtitle blocks</strong> ready to add.
              </span>
              <span className="text-[10px] uppercase font-mono tracking-wider bg-emerald-950 text-emerald-400 px-2 py-0.5 border border-emerald-800 rounded">
                Validated
              </span>
            </div>
          )}

          {/* Alignment / Timestamp math configuration section */}
          <div className="space-y-4 pt-3 border-t border-[#2a2a2e]/60">
            <label className="text-[10px] uppercase tracking-widest text-[#88888e] font-bold flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-[#c4a67e]" />
              2/ Timestamp Sequence Consolidation Settings
            </label>

            <div className="grid grid-cols-2 gap-4">
              {/* Option A: Continuous */}
              <div 
                onClick={() => setAlignmentMode("continuous")}
                className={`p-4 rounded-lg border-2 cursor-pointer transition flex flex-col justify-between ${
                  alignmentMode === "continuous"
                    ? "border-[#c4a67e] bg-[#c4a67e]/5"
                    : "border-[#2a2a2e] bg-[#0c0c0e] hover:border-[#3a3a3f]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Continuous Timeline</span>
                    <input 
                      type="radio" 
                      readOnly 
                      checked={alignmentMode === "continuous"} 
                      className="accent-[#c4a67e] h-3 w-3" 
                    />
                  </div>
                  <p className="text-[11px] text-[#88888e] leading-relaxed">
                    Shift timestamps sequentially relative to current last subtitle ending at <strong className="text-white font-mono">{lastBlockEndTime}</strong>.
                  </p>
                </div>
                
                <div className="mt-4 pt-3 border-t border-[#2a2a2e]/60">
                  <span className="text-[10px] text-[#55555e] block font-mono uppercase">Calculated base shift:</span>
                  <span className="text-[11px] text-[#c4a67e] font-mono font-bold">+ {lastBlockEndTime}</span>
                </div>
              </div>

              {/* Option B: Absolute */}
              <div 
                onClick={() => setAlignmentMode("absolute")}
                className={`p-4 rounded-lg border-2 cursor-pointer transition flex flex-col justify-between ${
                  alignmentMode === "absolute"
                    ? "border-[#c4a67e] bg-[#c4a67e]/5"
                    : "border-[#2a2a2e] bg-[#0c0c0e] hover:border-[#3a3a3f]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Absolute Timestamps</span>
                    <input 
                      type="radio" 
                      readOnly 
                      checked={alignmentMode === "absolute"} 
                      className="accent-[#c4a67e] h-3 w-3" 
                    />
                  </div>
                  <p className="text-[11px] text-[#88888e] leading-relaxed">
                    Keep timestamps identical to the uploaded resource block sequence. Useful if segment file holds original absolute timeline codes.
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#2a2a2e]/60">
                  <span className="text-[10px] text-[#55555e] block font-mono uppercase">Timeline adjustment:</span>
                  <span className="text-[11px] text-[#88888e] font-mono">No time adjustment (+0.0s)</span>
                </div>
              </div>
            </div>

            {/* Gap Buffer settings underneath for detail-oriented editors */}
            {alignmentMode === "continuous" && (
              <div className="bg-[#0c0c0e] p-4 border border-[#2a2a2e] rounded-lg space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-semibold text-white tracking-wide block">Gap Buffer Between Segments</label>
                    <span className="text-[10px] text-[#88888e] leading-normal font-sans">Introduce silent delay buffer before appending starts.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={gapSeconds}
                      onChange={(e) => setGapSeconds(parseFloat(e.target.value) || 0)}
                      className="w-16 px-1.5 py-1 text-center font-mono font-bold text-xs bg-[#121215] border border-[#2a2a2e] text-[#c4a67e] focus:border-[#c4a67e] rounded"
                    />
                    <span className="text-xs font-medium text-[#88888e]">seconds</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#2a2a2e]/50 text-[11px] flex justify-between items-center text-[#88888e] font-mono">
                  <span>Current Last End Code:</span>
                  <span>{lastBlockEndTime}</span>
                </div>
                <div className="text-[11px] flex justify-between items-center text-[#88888e] font-mono leading-none">
                  <span>New Starts Relative Base Time:</span>
                  <span className="text-[#c4a67e] font-bold">{msToTimecode(calculatedOffsetMs)}</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 text-xs font-medium text-rose-400 bg-rose-950/20 border border-rose-900/60 p-3 rounded flex items-center gap-2">
              <span className="shrink-0">•</span>
              <p className="leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        {/* Action Triggers footer */}
        <div className="p-5 border-t border-[#2a2a2e] bg-[#0c0c0e]/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#1c1c21] hover:bg-[#25252b] border border-[#2a2a2e] text-[#88888e] hover:text-white font-bold text-xs uppercase tracking-widest transition rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={parsedBlocks.length === 0}
            className="px-5 py-2.5 bg-[#c4a67e] hover:bg-[#d4ba94] text-black disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xs uppercase tracking-widest transition rounded shadow-lg shadow-[#c4a67e]/10 inline-flex items-center gap-2 cursor-pointer"
          >
            <span>Append {parsedBlocks.length || ""} Blocks</span>
            <ArrowDown className="h-3.5 w-3.5 animate-pulse" />
          </button>
        </div>
      </div>
    </div>
  );
}
