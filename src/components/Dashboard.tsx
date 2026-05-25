import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AgentConfig, AgentHistory } from "../types";
import {
  Play,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Eye,
} from "lucide-react";

export function Dashboard() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [history, setHistory] = useState<AgentHistory[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{
    image: string;
    prompt: string;
  } | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [confData, histData] = await Promise.all([
        api.getConfig(),
        api.getHistory(),
      ]);
      setConfig((prev) => ({ ...confData, ...prev }) as AgentConfig);
      if (!config) {
        setConfig(confData);
      }
      setHistory(histData);
    } catch (err: any) {
      showMessage("error", `Failed to load data: ${err.message}`);
    }
  }

  function showMessage(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setIsSaving(true);
    try {
      await api.saveConfig(config);
      showMessage(
        "success",
        "Configuration saved successfully. Scheduler updated.",
      );
    } catch (err: any) {
      showMessage("error", err.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTrigger() {
    setIsTriggering(true);
    showMessage(
      "success",
      "Generation triggered limit 30-40s... Check history for results.",
    );
    try {
      await api.triggerNow();
      showMessage(
        "success",
        "Image generated and uploaded to media library successfully.",
      );
      const newHist = await api.getHistory();
      setHistory(newHist);
    } catch (err: any) {
      showMessage("error", `Trigger failed: ${err.message}`);
    } finally {
      setIsTriggering(false);
    }
  }

  async function handlePreview() {
    if (!config) return;
    setIsPreviewing(true);
    setPreviewData(null);
    showMessage(
      "success",
      "Generating a preview based on your template... this may take 20s.",
    );
    try {
      const data = await api.testPreview(config);
      setPreviewData(data);
    } catch (err: any) {
      showMessage("error", err.message);
    } finally {
      setIsPreviewing(false);
    }
  }

  if (!config) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050505] text-white/40 font-sans">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-[#050505] text-[#F0F0F0] font-sans flex flex-col overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-[#0A0A0A] shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center shrink-0">
            <span className="text-black text-xs font-bold">AI</span>
          </div>
          <span className="font-serif text-xl tracking-wide italic">
            Daily Image Poster
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 hidden sm:flex">
            <div
              className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)] ${config.isActive ? "bg-emerald-500" : "bg-white/20 shadow-none"}`}
            ></div>
            <span
              className={`text-xs uppercase tracking-widest font-semibold ${config.isActive ? "text-emerald-500/80" : "text-white/40"}`}
            >
              {config.isActive ? "Automation Active" : "Automation Paused"}
            </span>
          </div>
          <div className="h-4 w-[1px] bg-white/20 hidden sm:block"></div>
          <button
            onClick={handlePreview}
            disabled={isPreviewing}
            className="text-xs uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isPreviewing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            Preview
          </button>
          <button
            onClick={handleTrigger}
            disabled={isTriggering || !config.webhookUrl}
            className="px-4 py-1.5 bg-white text-black text-xs font-bold uppercase tracking-tighter hover:bg-white/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isTriggering ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Upload Media
          </button>
        </div>
      </nav>

      {(message || !config.webhookUrl) && (
        <div className="shrink-0 px-8 py-3 bg-[#080808] border-b border-white/5 flex flex-col gap-2 z-10 relative">
          {message && (
            <div className="flex items-center gap-3 text-xs tracking-wide">
              {message.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500" />
              )}
              <span
                className={
                  message.type === "success"
                    ? "text-emerald-500"
                    : "text-amber-500"
                }
              >
                {message.text}
              </span>
            </div>
          )}
          {!config.webhookUrl && !message && (
            <div className="flex items-center gap-3 text-xs tracking-wide text-amber-500/80">
              <AlertCircle className="w-4 h-4" />
              <span>
                No Webhook URL configured. Please set your destination below.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Full-Screen Preview Modal (if active) */}
      {previewData && (
        <div
          className="fixed inset-0 bg-[#050505]/90 backdrop-blur-sm z-50 flex items-center justify-center p-8 animate-in fade-in duration-300"
          onClick={() => setPreviewData(null)}
        >
          <div
            className="max-w-4xl w-full bg-[#0A0A0A] border border-white/10 p-1 flex flex-col md:flex-row shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 border border-white/5 bg-[#111]">
              <img
                src={previewData.image}
                alt="Preview Generation"
                className="w-full h-auto object-cover max-h-[80vh]"
              />
            </div>
            <div className="w-full md:w-80 p-8 flex flex-col justify-between">
              <div>
                <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-4">
                  Generated Preview
                </h3>
                <p className="text-sm font-serif italic text-white/80 leading-relaxed">
                  {previewData.prompt}
                </p>
              </div>
              <button
                onClick={() => setPreviewData(null)}
                className="mt-8 px-4 py-2 bg-white/10 hover:bg-white/20 text-xs font-bold uppercase tracking-widest transition w-full"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Section: Main Configuration */}
        <section className="flex-[1.8] p-8 flex flex-col gap-6 overflow-y-auto">
          <div className="flex items-end justify-between shrink-0">
            <div>
              <h2 className="text-xs uppercase tracking-[0.3em] text-white/40 mb-2">
                Configuration
              </h2>
              <h1 className="font-serif text-4xl italic mb-1">
                Agent Settings
              </h1>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs text-white/30 uppercase tracking-widest">
                Server Time
              </p>
              <p className="text-sm font-mono text-white/70">
                {new Date().toLocaleTimeString("en-US", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSave}
            className="flex-1 bg-gradient-to-br from-[#111] to-[#080808] border border-white/5 p-8 flex flex-col gap-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 pb-5">
              <label className="text-xs uppercase tracking-[0.2em] text-white/70">
                Automated Schedule
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.isActive}
                  onChange={(e) =>
                    setConfig({ ...config, isActive: e.target.checked })
                  }
                />
                <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-white/5 pb-5">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-3">
                  Daily Run Time (HH:mm)
                </label>
                <input
                  type="time"
                  value={config.scheduleTime}
                  onChange={(e) =>
                    setConfig({ ...config, scheduleTime: e.target.value })
                  }
                  className="w-full bg-transparent border-b border-white/20 pb-2 text-xl font-light focus:outline-none focus:border-white transition text-white"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-3">
                    WP Auth Username
                  </label>
                  <input
                    type="text"
                    value={config.wpUsername || ""}
                    onChange={(e) =>
                      setConfig({ ...config, wpUsername: e.target.value })
                    }
                    placeholder="e.g., admin"
                    className="w-full bg-transparent border-b border-white/20 pb-2 text-sm focus:outline-none focus:border-white transition text-white placeholder-white/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-3">
                    WP Application Password
                  </label>
                  <input
                    type="password"
                    value={config.webhookToken}
                    onChange={(e) =>
                      setConfig({ ...config, webhookToken: e.target.value })
                    }
                    placeholder="App password"
                    className="w-full bg-transparent border-b border-white/20 pb-2 text-sm focus:outline-none focus:border-white transition text-white placeholder-white/20"
                  />
                </div>
              </div>
            </div>

            <div className="border-b border-white/5 pb-5">
              <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-3">
                Image Generation Template
              </label>
              <textarea
                rows={3}
                value={config.promptTemplate || config.prompt || ""}
                onChange={(e) =>
                  setConfig({ ...config, promptTemplate: e.target.value })
                }
                className="w-full bg-transparent border border-white/10 p-4 text-sm italic font-serif leading-relaxed text-white/80 focus:outline-none focus:border-white/40 transition resize-none"
                placeholder="A {subject}, in the style of {movement} by {artist}, using a {palette} color palette."
                required
              />
              <p className="text-[10px] text-white/30 mt-3 font-mono">
                Variables available:
                <span className="text-amber-500/80 mx-1">{"{subject}"}</span>
                <span className="text-amber-500/80 mx-1">{"{artist}"}</span>
                <span className="text-amber-500/80 mx-1">{"{movement}"}</span>
                <span className="text-amber-500/80 mx-1">{"{palette}"}</span>
              </p>
            </div>

            <div className="pb-4">
              <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-3">
                WordPress Media API URL
              </label>
              <input
                type="url"
                value={config.webhookUrl}
                onChange={(e) =>
                  setConfig({ ...config, webhookUrl: e.target.value })
                }
                placeholder="https://prominentpainting.com/wp-json/wp/v2/media"
                className="w-full bg-[#1A1A1A] border border-white/5 p-4 text-xs font-mono text-white/70 tracking-tight focus:outline-none focus:border-white/30 transition"
              />
            </div>

            <div className="mt-auto flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2 bg-transparent border border-white/20 hover:bg-white hover:text-black text-xs font-bold uppercase tracking-widest transition flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isSaving ? "Saving..." : "Deploy Settings"}
              </button>
            </div>
          </form>
        </section>

        {/* Right Section: History */}
        <aside className="flex-1 lg:border-l border-t lg:border-t-0 border-white/10 bg-[#080808] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-8 border-b border-white/10 flex justify-between items-center shrink-0">
            <h3 className="text-[10px] uppercase tracking-widest text-white/40">
              Activity Archives
            </h3>
            <button
              onClick={loadData}
              className="text-white/40 hover:text-white transition"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4">
            {history.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-20">
                <div className="w-16 h-16 border border-white flex items-center justify-center rotate-45 mb-4">
                  <div className="w-8 h-8 border border-white/50"></div>
                </div>
                <span className="font-serif italic text-sm">
                  No Archives Present
                </span>
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className="bg-white/5 border border-white/5 p-4 flex flex-col gap-3 group"
                >
                  <div className="flex justify-between items-start border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      {item.status === "success" ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                      )}
                      <span className="text-[10px] font-mono text-white/60">
                        {new Date(item.timestamp).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-white/40">
                      {item.status === "success" ? "Published" : "Failure"}
                    </span>
                  </div>

                  <p className="text-xs font-light text-white/70 leading-relaxed break-words">
                    {item.details}
                  </p>

                  {item.imageUrl && (
                    <div className="mt-2 text-center bg-[#050505] border border-white/5 p-2 grayscale group-hover:grayscale-0 transition-all duration-700">
                      <img
                        src={item.imageUrl}
                        alt="Archive"
                        className="w-full h-auto max-h-48 object-cover opacity-80 group-hover:opacity-100"
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="p-8 text-center shrink-0 border-t border-white/10">
            <p className="text-[9px] uppercase tracking-[0.3em] text-white/20">
              Aurelius Automations
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
