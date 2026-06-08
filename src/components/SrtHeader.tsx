import { Subtitles, Languages, Cpu, Info, Key } from "lucide-react";

interface SrtHeaderProps {
  onShowKeyInfo: () => void;
}

export default function SrtHeader({ onShowKeyInfo }: SrtHeaderProps) {
  return (
    <header className="border-b border-[#2a2a2e] bg-[#121215] sticky top-0 z-50 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-gradient-to-tr from-[#c4a67e] to-[#8c7851] rounded-lg flex items-center justify-center text-black font-extrabold shadow-lg shadow-black/40">
          <Subtitles className="h-5 w-5 text-black stroke-[2.5]" />
        </div>
        <div>
          <h1 className="text-xl font-serif italic text-white tracking-wide flex items-center gap-2">
            Linguist Gemini
            <span className="text-[10px] font-sans not-italic font-bold tracking-widest uppercase bg-[#c4a67e]/10 text-[#c4a67e] px-2 py-0.5 rounded border border-[#c4a67e]/30">
              Uncensored & Native
            </span>
          </h1>
          <p className="text-xs text-[#88888e] font-sans tracking-tight">
            Advanced Subtitle Translation Protocol • Perfect Timecode Sync
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-4 text-xs text-[#88888e] bg-[#0c0c0e] border border-[#2a2a2e] px-4 py-2 rounded-lg">
          <div className="flex items-center gap-1.5 font-medium text-[#d1d1d1]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            <span className="text-[10px] uppercase tracking-widest text-[#88888e]">AI Engine Ready</span>
          </div>
          <div className="h-3 w-[1px] bg-[#2a2a2e]" />
          <div className="flex items-center gap-1.5 font-medium text-[#c4a67e]">
            <Cpu className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px]">GEMINI-3.5</span>
          </div>
        </div>

        <button
          id="btn-show-key-info"
          onClick={onShowKeyInfo}
          className="px-4 py-1.5 border border-[#c4a67e] text-[#c4a67e] text-xs uppercase tracking-tighter hover:bg-[#c4a67e] hover:text-black transition-all cursor-pointer rounded-sm"
        >
          API Info
        </button>
      </div>
    </header>
  );
}
