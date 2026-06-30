import { WifiOff, Wifi, Download, RefreshCw } from "lucide-react";
import { useEffect, useState, useRef } from "react";

interface Props {
  aiAvailable: boolean;
  isOnline: boolean;
  recheck: () => void;
}

export function OfflineBanner({ aiAvailable, isOnline, recheck }: Props) {
  const [updateReady,  setUpdateReady]  = useState(false);
  const [updateInfo,   setUpdateInfo]   = useState<any>(null);
  const [justRecovered, setJustRecovered] = useState(false);
  const prevAiRef = useRef(aiAvailable);

  // Electron auto-updater events
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    api.onUpdateAvailable?.((info: any) => {
      console.log("Update available:", info.version);
    });

    api.onUpdateDownloaded?.((info: any) => {
      setUpdateInfo(info);
      setUpdateReady(true);
    });
  }, []);

  // Show a "back online" flash when AI recovers
  useEffect(() => {
    if (!prevAiRef.current && aiAvailable) {
      setJustRecovered(true);
      const t = setTimeout(() => setJustRecovered(false), 3000);
      return () => clearTimeout(t);
    }
    prevAiRef.current = aiAvailable;
  }, [aiAvailable]);

  // ── Update ready banner (highest priority) ───────────────────────────────
  if (updateReady) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2 text-sm font-medium"
        style={{
          background:   "rgba(99,102,241,0.15)",
          borderBottom: "1px solid rgba(99,102,241,0.3)",
        }}
      >
        <Download className="w-4 h-4 shrink-0" style={{ color: "#a5b4fc" }} />
        <span style={{ color: "#a5b4fc" }}>
          AstraNovaAI {updateInfo?.version} is ready — restart to install
        </span>
        <button
          onClick={() => (window as any).electronAPI?.installUpdate()}
          className="ml-auto px-3 py-1 rounded-lg text-xs font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
        >
          Restart & Install
        </button>
        <button
          onClick={() => setUpdateReady(false)}
          className="px-2 py-1 rounded text-xs"
          style={{ color: "#6366f1" }}
        >
          Later
        </button>
      </div>
    );
  }

  // ── Back online flash ────────────────────────────────────────────────────
  if (justRecovered) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-1.5 text-xs"
        style={{
          background:   "rgba(34,197,94,0.08)",
          borderBottom: "1px solid rgba(34,197,94,0.2)",
        }}
      >
        <Wifi className="w-3.5 h-3.5 shrink-0" style={{ color: "#4ade80" }} />
        <span style={{ color: "#86efac" }}>Back online — AI features restored</span>
      </div>
    );
  }

  // ── Offline banner ───────────────────────────────────────────────────────
  if (!aiAvailable) {
    return (
      <div
        className="flex items-center gap-2 px-4 py-1.5 text-xs"
        style={{
          background:   "rgba(239,68,68,0.08)",
          borderBottom: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        <WifiOff className="w-3.5 h-3.5 shrink-0" style={{ color: "#f87171" }} />
        <span style={{ color: "#fca5a5" }}>
          {isOnline
            ? "Can't reach AstraNovaAI servers — AI features unavailable"
            : "Offline — AI features unavailable. All other features work normally."}
        </span>
        <button
          onClick={recheck}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs"
          style={{ color: "#f87171" }}
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  return null;
}
