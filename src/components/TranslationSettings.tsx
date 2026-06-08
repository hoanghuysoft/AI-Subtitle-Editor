import { useState, useEffect, ChangeEvent } from "react";
import { ModelChoice, LanguageChoice } from "../types";
import { X, Settings, Sparkles, Languages, HelpCircle, Key, Cpu, Braces, RefreshCw } from "lucide-react";

interface TranslationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: string;
  setService: (service: string) => void;
  sourceLanguage: string;
  setSourceLanguage: (src: string) => void;
  targetLanguage: string;
  setTargetLanguage: (target: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  customInstructions: string;
  setCustomInstructions: (inst: string) => void;
  chunkSize: number;
  setChunkSize: (size: number) => void;
  userGeminiApiKey: string;
  setUserGeminiApiKey: (key: string) => void;
  userOpenRouterApiKey: string;
  setUserOpenRouterApiKey: (key: string) => void;
}

const GEMINI_MODELS: ModelChoice[] = [
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    description: "Extremely fast processing, free tier, exceptional accuracy for subtitling.",
    isPaid: false,
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro",
    description: "Advanced reasoning. Maximum metaphor handling. Paid key is recommended.",
    isPaid: true,
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    description: "Lowest latency protocol. Fast & light context mappings.",
    isPaid: false,
  }
];

const PRESET_OPENROUTER_MODELS: ModelChoice[] = [
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash (Preset)",
    description: "Exceptional speed and cost-efficiency through OpenRouter endpoint.",
    isPaid: false,
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro (Preset)",
    description: "Expert contextual translation for complex dialogue metaphors.",
    isPaid: false,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "LLaMA 3.3 70B (Preset)",
    description: "Highly performant meta instruction model for natural local phrasing.",
    isPaid: false,
  },
  {
    id: "mistralai/mistral-large",
    name: "Mistral Large (Preset)",
    description: "Excellent multilingual translation logic with high context preservation.",
    isPaid: false,
  }
];

const SOURCE_PRESETS: LanguageChoice[] = [
  { code: "Auto-Detect", name: "Auto-Detect Language", flag: "🔍" },
  { code: "English", name: "English", flag: "🇺🇸" },
  { code: "Spanish", name: "Spanish", flag: "🇪🇸" },
  { code: "French", name: "French", flag: "🇫🇷" },
  { code: "Vietnamese", name: "Vietnamese", flag: "🇻🇳" },
  { code: "Japanese", name: "Japanese", flag: "🇯🇵" },
  { code: "Korean", name: "Korean", flag: "🇰🇷" },
  { code: "Chinese", name: "Chinese", flag: "🇨🇳" },
];

const TARGET_PRESETS: LanguageChoice[] = [
  { code: "Spanish", name: "Spanish", flag: "🇪🇸" },
  { code: "Vietnamese", name: "Vietnamese", flag: "🇻🇳" },
  { code: "Japanese", name: "Japanese", flag: "🇯🇵" },
  { code: "French", name: "French", flag: "🇫🇷" },
  { code: "German", name: "German", flag: "🇩🇪" },
  { code: "Italian", name: "Italian", flag: "🇮🇹" },
  { code: "Korean", name: "Korean", flag: "🇰🇷" },
  { code: "Chinese (Simplified)", name: "Chinese (Simplified)", flag: "🇨🇳" },
  { code: "Chinese (Traditional)", name: "Chinese (Traditional)", flag: "🇹🇼" },
  { code: "Portuguese", name: "Portuguese", flag: "🇵🇹" },
  { code: "Russian", name: "Russian", flag: "🇷🇺" },
  { code: "Swahili", name: "Swahili", flag: "🇰🇪" },
];

export default function TranslationSettings({
  isOpen,
  onClose,
  service,
  setService,
  sourceLanguage,
  setSourceLanguage,
  targetLanguage,
  setTargetLanguage,
  selectedModel,
  setSelectedModel,
  customInstructions,
  setCustomInstructions,
  chunkSize,
  setChunkSize,
  userGeminiApiKey,
  setUserGeminiApiKey,
  userOpenRouterApiKey,
  setUserOpenRouterApiKey,
}: TranslationSettingsModalProps) {
  const [customSrc, setCustomSrc] = useState("");
  const [isCustomSrcActive, setIsCustomSrcActive] = useState(false);

  const [customTarget, setCustomTarget] = useState("");
  const [isCustomTargetActive, setIsCustomTargetActive] = useState(false);

  const [isCustomModelActive, setIsCustomModelActive] = useState(false);
  const [customModelVal, setCustomModelVal] = useState("");

  const [openRouterModels, setOpenRouterModels] = useState<ModelChoice[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [loadedFromApi, setLoadedFromApi] = useState(false);

  // Synchronize dynamic model entries and local storages configs on mount helper
  useEffect(() => {
    // Check if the current model is a custom manually keyed string (not in presets)
    const isGemPreset = GEMINI_MODELS.some(m => m.id === selectedModel);
    const isOpenPreset = PRESET_OPENROUTER_MODELS.some(m => m.id === selectedModel);
    
    if (service === "gemini") {
      if (!isGemPreset && selectedModel) {
        setIsCustomModelActive(true);
        setCustomModelVal(selectedModel);
      } else {
        setIsCustomModelActive(false);
      }
    } else {
      if (!isOpenPreset && selectedModel) {
        // Double-check dynamic ones too
        const inFetched = openRouterModels.some(m => m.id === selectedModel);
        if (!inFetched && selectedModel) {
          setIsCustomModelActive(true);
          setCustomModelVal(selectedModel);
        }
      } else {
        setIsCustomModelActive(false);
      }
    }
  }, [isOpen, selectedModel, service]);

  // Handle Fetching OpenRouter Model List
  const fetchOpenRouterModels = async () => {
    setIsLoadingModels(true);
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/models");
      if (resp.ok) {
        const payload = await resp.json();
        if (payload && Array.isArray(payload.data)) {
          const list: ModelChoice[] = payload.data.slice(0, 50).map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            description: m.description ? m.description.slice(0, 100) + "..." : "Available via OpenRouter endpoint.",
            isPaid: false,
          }));
          setOpenRouterModels(list);
          setLoadedFromApi(true);
        }
      }
    } catch (e) {
      console.error("Failed to dynamically resolve OpenRouter model database registry:", e);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    if (isOpen && service === "openrouter" && !loadedFromApi) {
      fetchOpenRouterModels();
    }
  }, [isOpen, service, loadedFromApi]);

  const handleServiceChange = (newService: string) => {
    setService(newService);
    setIsCustomModelActive(false);
    if (newService === "openrouter") {
      setSelectedModel("google/gemini-2.5-flash");
    } else {
      setSelectedModel("gemini-3.5-flash");
    }
  };

  // State save persist bindings
  const handleGeminiKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setUserGeminiApiKey(val);
    localStorage.setItem("gemini_api_key", val);
  };

  const handleOpenRouterKeyChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setUserOpenRouterApiKey(val);
    localStorage.setItem("openrouter_api_key", val);
  };

  const handleSrcSelect = (code: string) => {
    setIsCustomSrcActive(false);
    setSourceLanguage(code);
    localStorage.setItem("srt_source_language", code);
  };

  const handleCustomSrcInput = (e: ChangeEvent<HTMLInputElement>) => {
    setCustomSrc(e.target.value);
    setSourceLanguage(e.target.value);
    localStorage.setItem("srt_source_language", e.target.value);
  };

  const handleTargetSelect = (code: string) => {
    setIsCustomTargetActive(false);
    setTargetLanguage(code);
    localStorage.setItem("srt_target_language", code);
  };

  const handleCustomTargetInput = (e: ChangeEvent<HTMLInputElement>) => {
    setCustomTarget(e.target.value);
    setTargetLanguage(e.target.value);
    localStorage.setItem("srt_target_language", e.target.value);
  };

  const handleSelectModel = (mId: string) => {
    setIsCustomModelActive(false);
    setSelectedModel(mId);
  };

  const handleCustomModelInput = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setCustomModelVal(val);
    setSelectedModel(val);
  };

  if (!isOpen) return null;

  const currentPreFillModels = service === "openrouter" 
    ? [...PRESET_OPENROUTER_MODELS, ...openRouterModels] 
    : GEMINI_MODELS;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto animate-fade-in">
      <div 
        className="bg-[#121215] border border-[#2a2a2e] w-full max-w-2xl rounded-xl overflow-hidden shadow-2xl flex flex-col my-8 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Window Header */}
        <div className="p-5 border-b border-[#2a2a2e] flex justify-between items-center bg-[#0c0c0e]">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-[#c4a67e]" />
            <h2 className="font-serif italic text-white text-md tracking-wider">Translation Engine Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-[#88888e] hover:text-white p-1 rounded-full transition-colors hover:bg-[#1c1c21]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body Contents */}
        <div className="p-6 overflow-y-auto space-y-6 bg-[#121215]">
          
          {/* Service Provider Tabs */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[#88888e] flex items-center gap-1.5 font-sans">
              <Cpu className="h-3.5 w-3.5 text-[#c4a67e]" /> Language Intelligence Service
            </label>
            <div className="grid grid-cols-2 gap-2 bg-[#0c0c0e] p-1.5 rounded border border-[#2a2a2e]">
              <button
                type="button"
                onClick={() => handleServiceChange("gemini")}
                className={`py-2 text-xs font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                  service === "gemini"
                    ? "bg-[#c4a67e] text-black font-extrabold shadow-lg shadow-[#c4a67e]/10"
                    : "text-[#88888e] hover:text-[#d1d1d1] bg-transparent"
                }`}
              >
                Google Gemini Cloud
              </button>
              <button
                type="button"
                onClick={() => handleServiceChange("openrouter")}
                className={`py-2 text-xs font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                  service === "openrouter"
                    ? "bg-[#c4a67e] text-black font-extrabold shadow-lg shadow-[#c4a67e]/10"
                    : "text-[#88888e] hover:text-[#d1d1d1] bg-transparent"
                }`}
              >
                OpenRouter Endpoint
              </button>
            </div>
          </div>

          {/* Secure API Key Inputs */}
          <div className="bg-[#0c0c0e]/60 border border-[#2a2a2e] p-4 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-[#c4a67e] font-sans flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5" /> Client API Key Configuration
              </span>
              <span className="text-[9px] text-[#55555e] font-mono leading-none italic uppercase">Stored locally</span>
            </div>

            {service === "gemini" ? (
              <div className="space-y-1">
                <label className="text-[10px] text-[#88888e]">Your Custom Gemini Key (Overrides Server Default)</label>
                <input
                  type="password"
                  placeholder="Paste your API key here (AIzaSy...)"
                  value={userGeminiApiKey}
                  onChange={handleGeminiKeyChange}
                  className="w-full text-xs px-3.5 py-2 rounded bg-[#121215] border border-[#2a2a2e] text-white focus:border-[#c4a67e] focus:outline-none placeholder-[#55555e] font-mono"
                />
                <p className="text-[9px] text-[#55555e] italic leading-tight mt-0.5">
                  Leave this empty to fall back on the applet secure default server-side API Key.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] text-[#88888e]">Your OpenRouter API Key (Required for OpenRouter)</label>
                <input
                  type="password"
                  placeholder="Paste your OpenRouter key here (sk-or-v1-...)"
                  value={userOpenRouterApiKey}
                  onChange={handleOpenRouterKeyChange}
                  className="w-full text-xs px-3.5 py-2 rounded bg-[#121215] border border-[#2a2a2e] text-white focus:border-[#c4a67e] focus:outline-none placeholder-[#55555e] font-mono"
                />
                <p className="text-[9px] text-[#55555e] italic leading-tight mt-0.5">
                  Required when translating via OpenRouter endpoints. Configured strictly inside your active browser session.
                </p>
              </div>
            )}
          </div>

          {/* SRT Original (Source) Language */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[#88888e] flex items-center gap-1.5 font-sans">
              <Languages className="h-3.5 w-3.5 text-[#c4a67e]" /> Specify Original Subtitle Language
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-[120px] overflow-y-auto border border-[#2a2a2e] bg-[#0c0c0e] p-2 rounded">
              {SOURCE_PRESETS.map((lang) => {
                const isSelected = !isCustomSrcActive && sourceLanguage === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleSrcSelect(lang.code)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold text-left transition-all ${
                      isSelected
                        ? "bg-[#c4a67e] text-black"
                        : "bg-[#1c1c21] hover:bg-[#25252b] text-[#d1d1d1]"
                    }`}
                  >
                    <span className="text-sm shrink-0">{lang.flag}</span>
                    <span className="truncate">{lang.name}</span>
                  </button>
                );
              })}
            </div>
            {/* Custom Input */}
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  setIsCustomSrcActive(true);
                  setSourceLanguage(customSrc || "English");
                }}
                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                  isCustomSrcActive ? "bg-[#c4a67e] text-black" : "bg-[#1c1c21] text-[#88888e] hover:text-[#d1d1d1] border border-[#2a2a2e]"
                }`}
              >
                Custom Source
              </button>
              <input
                type="text"
                placeholder="e.g. Italian, Thai, Russian slang"
                value={customSrc}
                disabled={!isCustomSrcActive}
                onChange={handleCustomSrcInput}
                className={`w-full text-xs px-3.5 py-1.5 rounded border focus:outline-none transition-all ${
                  isCustomSrcActive
                    ? "border-[#c4a67e]/60 bg-[#0c0c0e] text-white focus:border-[#c4a67e] focus:ring-1"
                    : "border-[#2a2a2e] bg-[#0c0c0e]/40 text-[#55555e] cursor-not-allowed"
                }`}
              />
            </div>
          </div>

          {/* Target Language */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-[#88888e] flex items-center gap-1.5 font-sans">
              <Languages className="h-3.5 w-3.5 text-[#c4a67e]" /> Target Translation Language
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-[120px] overflow-y-auto border border-[#2a2a2e] bg-[#0c0c0e] p-2 rounded">
              {TARGET_PRESETS.map((lang) => {
                const isSelected = !isCustomTargetActive && targetLanguage === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => handleTargetSelect(lang.code)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-semibold text-left transition-all ${
                      isSelected
                        ? "bg-[#c4a67e] text-black"
                        : "bg-[#1c1c21] hover:bg-[#25252b] text-[#d1d1d1]"
                    }`}
                  >
                    <span className="text-sm shrink-0">{lang.flag}</span>
                    <span className="truncate">{lang.name}</span>
                  </button>
                );
              })}
            </div>
            {/* Custom Input */}
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  setIsCustomTargetActive(true);
                  setTargetLanguage(customTarget || "Japanese");
                }}
                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                  isCustomTargetActive ? "bg-[#c4a67e] text-black" : "bg-[#1c1c21] text-[#88888e] hover:text-[#d1d1d1] border border-[#2a2a2e]"
                }`}
              >
                Custom Target
              </button>
              <input
                type="text"
                placeholder="e.g. Swahili, French Slang, Irish Gaeilge"
                value={customTarget}
                disabled={!isCustomTargetActive}
                onChange={handleCustomTargetInput}
                className={`w-full text-xs px-3.5 py-1.5 rounded border focus:outline-none transition-all ${
                  isCustomTargetActive
                    ? "border-[#c4a67e]/60 bg-[#0c0c0e] text-white focus:border-[#c4a67e] focus:ring-1"
                    : "border-[#2a2a2e] bg-[#0c0c0e]/40 text-[#55555e] cursor-not-allowed"
                }`}
              />
            </div>
          </div>

          {/* Model Selection and Custom Entry */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest text-[#88888e] flex items-center gap-1.5 font-sans">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Choose Model
              </label>
              {service === "openrouter" && (
                <button
                  type="button"
                  onClick={fetchOpenRouterModels}
                  disabled={isLoadingModels}
                  className="text-[9px] text-[#c4a67e] hover:text-white flex items-center gap-1 font-mono tracking-wider cursor-pointer uppercase disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
                  Refresh Model Catalog
                </button>
              )}
            </div>

            {/* Quick Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
              {currentPreFillModels.map((m) => {
                const isSelected = !isCustomModelActive && selectedModel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectModel(m.id)}
                    className={`p-2.5 rounded border text-left flex flex-col gap-1 transition-all ${
                      isSelected
                        ? "border-[#c4a67e] bg-[#c4a67e]/5 shadow-sm"
                        : "border-[#2a2a2e] bg-[#1c1c21] hover:bg-[#25252b]"
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className={`text-[11px] font-bold truncate ${isSelected ? "text-white" : "text-[#d1d1d1]"}`}>{m.name}</span>
                      {m.isPaid && (
                        <span className="text-[7px] bg-amber-950 text-amber-300 px-1 py-0.2 rounded border border-amber-900 font-mono font-extrabold shrink-0 uppercase">PAID</span>
                      )}
                    </div>
                    <p className="text-[9px] text-[#88888e] leading-snug line-clamp-1 truncate">{m.description}</p>
                  </button>
                );
              })}
            </div>

            {/* User Custom Model Entry Input */}
            <div className="bg-[#121215]/50 border border-[#2a2a2e] p-3 rounded space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomModelActive(true);
                    setSelectedModel(customModelVal || (service === "openrouter" ? "google/gemini-2.5-flash" : "gemini-3.5-flash"));
                  }}
                  className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 ${
                    isCustomModelActive ? "bg-[#c4a67e] text-black" : "bg-[#1c1c21] text-[#88888e] hover:text-[#d1d1d1] border border-[#2a2a2e]"
                  }`}
                >
                  Type Custom Model Identifier
                </button>
                <input
                  type="text"
                  placeholder={service === "openrouter" ? "deepseek/deepseek-chat" : "gemini-2.1-pro"}
                  value={customModelVal}
                  disabled={!isCustomModelActive}
                  onChange={handleCustomModelInput}
                  className={`w-full text-xs px-3 py-1.5 rounded border focus:outline-none transition-all font-mono ${
                    isCustomModelActive
                      ? "border-[#c4a67e]/60 bg-[#0c0c0e] text-white focus:border-[#c4a67e]"
                      : "border-[#2a2a2e] bg-[#0c0c0e]/40 text-[#55555e] cursor-not-allowed"
                  }`}
                />
              </div>
              <p className="text-[9px] text-[#55555e] italic leading-tight">
                Perfect for custom fine-tunes or testing newly published model endpoints. Enter the full identifier key (e.g. <code className="bg-[#1c1c21] p-0.5 border border-[#2a2a2e]">anthropic/claude-3-5-sonnet</code>).
              </p>
            </div>
          </div>

          {/* Custom Translation prompts & Batch chunk size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[#88888e] flex justify-between items-center font-sans">
                <span>Custom Directives</span>
                <span className="text-[9px] text-[#55555e] lowercase italic">optional</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. 'Translate into friendly informal Swahili slang', 'Keep phrasing extremely dramatic'."
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                className="w-full text-xs px-3.5 py-2 rounded bg-[#0c0c0e] border border-[#2a2a2e] focus:border-[#c4a67e] focus:ring-1 focus:ring-[#c4a67e]/30 text-white placeholder-[#55555e] leading-relaxed resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-[#88888e] font-sans">
                Batch Chunk Size
              </label>
              <select
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="w-full text-xs px-3.5 py-2 rounded bg-[#0c0c0e] border border-[#2a2a2e] focus:border-[#c4a67e] text-white focus:outline-none"
              >
                <option value={10}>10 items per batch (High Context Safety)</option>
                <option value={20}>20 items per batch (Highly Resilient)</option>
                <option value={25}>25 items per batch (Balanced Profile)</option>
                <option value={40}>40 items per batch (High Performance)</option>
                <option value={50}>50 items per batch (Max Throughput)</option>
              </select>
              <p className="text-[9px] text-[#55555e] leading-snug">
                Smaller chunk metrics prevent LLM context dilution and protect subtitle mapping index association against timeouts.
              </p>
            </div>

          </div>

        </div>

        {/* Modal Window Footer Actions */}
        <div className="p-5 border-t border-[#2a2a2e] bg-[#0c0c0e] flex items-center justify-between">
          <div className="text-[10px] text-[#55555e] font-sans">
            Ready to apply parameters on the active subtitle dataset
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 text-black bg-[#c4a67e] hover:bg-[#d4ba94] font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-[#c4a67e]/15 cursor-pointer"
          >
            Apply Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
