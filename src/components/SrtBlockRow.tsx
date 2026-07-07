import { SubtitleBlock } from "../types";
import { Check, AlertCircle, Loader2, ArrowUp, ArrowDown, Sparkles, X, CornerDownRight } from "lucide-react";
import { useState, useEffect } from "react";

interface SrtBlockRowProps {
  key?: any;
  block: SubtitleBlock;
  onTextUpdate: (id: number, text: string) => void;
  onSingleTranslate: (id: number, inlineInstruction?: string) => void | Promise<void>;
  onCancelAndRerun: (id: number) => void | Promise<void>;
  onMergeAbove: (id: number) => void;
  onMergeUnder: (id: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

export default function SrtBlockRow({ 
  block, 
  onTextUpdate, 
  onSingleTranslate, 
  onCancelAndRerun,
  onMergeAbove, 
  onMergeUnder,
  isFirst,
  isLast
}: SrtBlockRowProps) {
  const isTranslating = block.status === "translating";
  const isDone = block.status === "done";
  const isFailed = block.status === "failed";

  const [showContextInput, setShowContextInput] = useState(false);
  const [contextText, setContextText] = useState("");
  const [secondsElapsed, setSecondsElapsed] = useState(0);

  useEffect(() => {
    if (!isTranslating) {
      setSecondsElapsed(0);
      return;
    }
    const startTime = block.translationStartTime || Date.now();
    setSecondsElapsed(Math.round((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setSecondsElapsed(Math.round((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isTranslating, block.translationStartTime]);

  const handleTriggerTranslate = async () => {
    if (!contextText.trim()) return;
    await onSingleTranslate(block.id, contextText.trim());
    setShowContextInput(false);
    setContextText("");
  };

  return (
    <div
      id={`srt-block-row-${block.id}`}
      className={`grid grid-cols-1 md:grid-cols-12 gap-4 p-4 border-b border-[#2a2a2e] transition-colors items-start ${
        isTranslating ? "bg-[#c4a67e]/5 border-l-2 border-l-[#c4a67e]" : ""
      } ${isFailed ? "bg-rose-950/10 border-l-2 border-l-rose-500" : ""} ${
        isDone ? "hover:bg-[#121215]/60 bg-transparent" : "bg-[#0c0c0e]/30"
      }`}
    >
      {/* Metrics Column */}
      <div className="md:col-span-2 flex md:flex-col items-center md:items-start justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-bold bg-[#1c1c21] text-[#c4a67e] border border-[#2a2a2e] px-2 py-0.5 rounded min-w-[28px] text-center font-mono">
            {String(block.id).padStart(3, "0")}
          </span>
          {isDone && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
          {isTranslating && <Loader2 className="h-4 w-4 text-[#c4a67e] animate-spin shrink-0" />}
          {isFailed && <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />}
        </div>
        <div className="text-[10px] text-[#88888e] font-mono tracking-tight mt-1">
          <div>{block.startTime}</div>
          <div className="text-center md:text-left text-[9px] text-[#55555e]">↓</div>
          <div>{block.endTime}</div>
        </div>
      </div>

      {/* English/Original Column */}
      <div className="md:col-span-5 bg-[#121215] p-3 rounded border border-[#2a2a2e] min-h-[64px]">
        <div className="text-[9px] font-bold text-[#88888e] uppercase tracking-wider mb-1.5 font-sans">Original Dialogue</div>
        <div className="text-xs text-[#d1d1d1] italic whitespace-pre-wrap leading-relaxed font-sans">
          "{block.text}"
        </div>
      </div>

      {/* Target Translation Column */}
      <div className="md:col-span-5 flex flex-col gap-1.5">
        <div className="text-[9px] font-bold text-[#88888e] uppercase tracking-wider mb-0.5 flex justify-between items-center font-sans">
          <span className={isDone ? "text-[#c4a67e]" : ""}>Translation</span>
          {isDone && <span className="text-[8px] bg-emerald-950/50 text-emerald-400 border border-emerald-900 px-1 py-0.2 rounded uppercase font-mono">Editable</span>}
        </div>

        {isDone && (
          <textarea
            id={`translate-textarea-${block.id}`}
            rows={2}
            value={block.translatedText || ""}
            onChange={(e) => onTextUpdate(block.id, e.target.value)}
            className="w-full text-xs font-medium px-3 py-2 bg-[#1c1c21] text-white border border-[#3a3a3f] focus:border-[#c4a67e] focus:ring-1 focus:ring-[#c4a67e]/30 rounded leading-relaxed resize-none font-sans"
            placeholder="Edit translation here..."
          />
        )}

        {isTranslating && (
          <div className="flex flex-col gap-2 p-3 bg-[#c4a67e]/5 border border-[#c4a67e]/20 rounded text-[#c4a67e]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-[#c4a67e]" />
                <span className="text-[10px] font-mono tracking-widest uppercase animate-pulse">
                  Processing Block... {secondsElapsed > 0 ? `(${secondsElapsed}s)` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onCancelAndRerun(block.id)}
                className="text-[9px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded border border-[#c4a67e]/40 hover:bg-[#c4a67e] hover:text-black transition-all cursor-pointer font-sans"
                title="Cancel active request and restart translation for this block"
              >
                Cancel & Rerun
              </button>
            </div>
            {secondsElapsed >= 35 && (
              <div className="text-[9px] text-[#c4a67e]/80 font-sans italic animate-pulse mt-0.5 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 inline shrink-0" />
                <span>Taking longer than 35s. You can click "Cancel & Rerun" to restart.</span>
              </div>
            )}
          </div>
        )}

        {isFailed && (
          <div className="flex flex-col gap-2 p-3 bg-rose-950/20 border border-rose-900/50 rounded text-rose-300">
            <div className="text-xs leading-relaxed flex items-center gap-1.5 font-sans">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="font-semibold">Failed:</span>
              <span className="opacity-90">{block.error || "Network error"}</span>
            </div>
            <button
              id={`row-retry-btn-${block.id}`}
              type="button"
              onClick={() => onCancelAndRerun(block.id)}
              className="text-[10px] uppercase font-bold text-rose-300 hover:text-black bg-rose-950 border border-rose-800 hover:bg-rose-400 px-3.5 py-1 rounded self-start transition-all cursor-pointer font-sans tracking-wider"
            >
              Cancel & Rerun block
            </button>
          </div>
        )}

        {block.status === "pending" && (
          <div className="flex items-center gap-2 h-[64px] bg-[#0c0c0e] border border-dashed border-[#2a2a2e] rounded px-4 text-[#55555e] text-xs">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#55555e]">Pending translation...</span>
          </div>
        )}
      </div>

      {/* Action utilities bar for subtitle merging and target inline prompting context */}
      <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#2a2a2e]/40 mt-1">
        {/* Subtitle frame consolidation widgets */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMergeAbove(block.id)}
            disabled={isFirst}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold bg-[#1a1a1f] hover:bg-[#25252b] border border-[#2a2a2e]/80 hover:border-[#3a3a3f] text-[#88888e] hover:text-[#d1d1d1] px-2.5 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer font-sans"
            title="Consolidate target timeline metrics and script dialogue with block above"
          >
            <ArrowUp className="h-3 w-3 text-[#c4a67e]" />
            Merge Above
          </button>
          <button
            type="button"
            onClick={() => onMergeUnder(block.id)}
            disabled={isLast}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold bg-[#1a1a1f] hover:bg-[#25252b] border border-[#2a2a2e]/80 hover:border-[#3a3a3f] text-[#88888e] hover:text-[#d1d1d1] px-2.5 py-1 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer font-sans"
            title="Consolidate target timeline metrics and script dialogue with block below"
          >
            <ArrowDown className="h-3 w-3 text-[#c4a67e]" />
            Merge Under
          </button>
        </div>

        {/* Retranslation Context toggling helper */}
        <div className="flex items-center gap-2">
          {!showContextInput ? (
            <button
              type="button"
              onClick={() => setShowContextInput(true)}
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-white bg-[#1c1c21] hover:bg-[#25252b] border border-[#c4a67e]/45 hover:border-[#c4a67e] px-3 py-1.5 rounded transition-all cursor-pointer shadow-sm hover:shadow-[#c4a67e]/5 font-sans"
            >
              <Sparkles className="h-3 w-3 text-amber-500 animate-pulse" />
              Retranslate with Context
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-[#88888e] font-sans">
              <span>Enter context descriptor below:</span>
            </div>
          )}
        </div>
      </div>

      {/* Inline Context Input Drawer */}
      {showContextInput && (
        <div className="md:col-span-12 bg-[#0c0c0e]/80 rounded-lg p-3 border border-[#c4a67e]/20 mt-2 flex flex-col gap-2.5 animate-slide-up">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#c4a67e] flex items-center gap-1 font-sans">
              <CornerDownRight className="h-3 w-3" /> Inline Translation Directive
            </span>
            <button
              type="button"
              onClick={() => {
                setShowContextInput(false);
                setContextText("");
              }}
              className="text-[#66666e] hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Explain situational context (e.g. 'She is whispering in fear', 'A sarcastic tone', 'Preserve the old idiom')"
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
              className="flex-1 text-xs px-3 py-2 rounded bg-[#121215] border border-[#2a2a2e] focus:border-[#c4a67e] text-white focus:outline-none placeholder-[#55555e] font-sans"
              onKeyDown={(e) => {
                if (e.key === "Enter" && contextText.trim()) {
                  handleTriggerTranslate();
                }
              }}
            />
            <button
              type="button"
              disabled={isTranslating || !contextText.trim()}
              onClick={handleTriggerTranslate}
              className="px-4 py-2 bg-[#c4a67e] hover:bg-[#d4ba94] text-black font-bold text-xs uppercase tracking-wider rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 inline-flex items-center gap-1 cursor-pointer font-sans"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Retranslate
            </button>
          </div>
          <p className="text-[9px] text-[#55555e] leading-none italic font-sans">
            Your direction overrides the defaults and translates block ID: {block.id} instantly.
          </p>
        </div>
      )}
    </div>
  );
}
