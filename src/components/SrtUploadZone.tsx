import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, FileCode, Check, AlertCircle } from "lucide-react";

interface SrtUploadZoneProps {
  onFileLoaded: (name: string, content: string) => void;
  onLoadSample: () => void;
}

export default function SrtUploadZone({ onFileLoaded, onLoadSample }: SrtUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file.name.endsWith(".srt") && !file.name.endsWith(".txt")) {
      setError("Please upload an SRT format subtitle file (.srt).");
      return;
    }
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        onFileLoaded(file.name, content);
      } else {
        setError("Could not read file content.");
      }
    };
    reader.onerror = () => {
      setError("An error occurred while reading the file.");
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
    setError(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[#121215] border border-[#2a2a2e] rounded-xl min-h-[340px] text-center transition-all">
      <div
        id="drag-and-drop-container"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full max-w-xl p-10 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
          isDragging
            ? "border-[#c4a67e] bg-[#c4a67e]/10 scale-[1.01]"
            : "border-[#3a3a3f] hover:border-[#c4a67e]/60 bg-[#0c0c0e]"
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".srt,.txt"
          className="hidden"
        />

        <div className={`p-4 rounded-full mb-4 transition-colors ${isDragging ? "bg-[#c4a67e]/20 text-[#c4a67e]" : "bg-[#1c1c1f] text-[#88888e]"}`}>
          <Upload className="h-8 w-8 stroke-[1.5]" />
        </div>

        <h3 className="font-serif italic text-white text-lg mb-1 tracking-wide">
          Upload your SRT subtitle file
        </h3>
        <p className="text-xs text-[#88888e] mb-5 max-w-sm font-sans">
          Drag and drop your <code className="bg-[#1c1c21] text-[#c4a67e] px-1.5 py-0.5 rounded border border-[#2a2a2e] font-semibold font-mono">.srt</code> file here, or click to browse files
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="text-[10px] bg-[#121215] text-[#88888e] border border-[#2a2a2e] px-3 py-1 font-mono uppercase tracking-wider"> UTF-8 ENCODED </span>
          <span className="text-[10px] bg-[#121215] text-[#88888e] border border-[#2a2a2e] px-3 py-1 font-mono uppercase tracking-wider"> MAX 15MB </span>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-rose-400 bg-rose-950/20 border border-rose-900/55 px-4 py-2.5 rounded text-xs max-w-md animate-fade-in">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-medium text-left">{error}</span>
        </div>
      )}

      <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
        <span className="text-xs text-[#55555e] uppercase tracking-widest">Don't have an SRT file?</span>
        <button
          id="btn-load-sample"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLoadSample();
          }}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#c4a67e] bg-transparent border border-[#c4a67e] hover:bg-[#c4a67e] hover:text-black px-5 py-2.5 transition uppercase tracking-widest cursor-pointer"
        >
          <FileCode className="h-3.5 w-3.5" />
          Load Trial Multilingual SRT
        </button>
      </div>
    </div>
  );
}
