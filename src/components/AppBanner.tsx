/**
 * AppBanner — single top-of-screen banner that handles:
 *   1. Update available / ready to install  (highest priority)
 *   2. Back online flash                    (3s green confirmation)
 *   3. Offline / server unreachable         (persistent red warning)
 *
 * Import this once in your root layout and pass the hook values in.
 *
 * Usage:
 *   const { isOnline, aiAvailable, checking, recheck } = useOnlineStatus();
 *   const { update, installUpdate, dismiss } = useAutoUpdater();
 *   <AppBanner ... />
 */

import { WifiOff, Wifi, Download, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UpdateState } from "../hooks/useAutoUpdater";

interface Props {
  isOnline:    boolean;
  aiAvailable: boolean;
  checking:    boolean;
  recheck:     () => void;
  update:      UpdateState;
  installUpdate: () => void;
  dismissUpdate: () => void;
}

export function AppBanner({
  isOnline,
  aiAvailable,
  checking,
  recheck,
  update,
  installUpdate,
  dismissUpdate,
}: Props) {
  const [justRecovered, setJustRecovered] = useState(false);
  const prevAiRef = useRef(aiAvailable);

  // Flash "back online" when AI recovers
  useEffect(() => {
    if (!prevAiRef.current && aiAvailable) {
      setJustRecovered(true);
      const t = setTimeout(() => setJustRecovered(false), 3000);
      return () => clearTimeout(t);
    }
    prevAiRef.current = aiAvailable;
  }, [aiAvailable]);

  // ── 1. Update ready to install ───────────────────────────────────────────
  if (update.status === "ready") {
    return (
      <Banner color="indigo">
        <Download className="w-4 h-4 shrink-0" />
        <span>
          AstraNovaAI <strong>{(update as any).version}</strong> is ready — restart to install
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={installUpdate}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-white"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
          >
            Restart & Install
          </button>
          <button onClick={dismissUpdate} aria-label="Dismiss">
            <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
          </button>
        </div>
      </Banner>
    );
  }

  // ── 2. Update available (downloading) ────────────────────────────────────
  if (update.status === "available") {
    return (
      <Banner color="indigo">
        <Download className="w-4 h-4 shrink-0 animate-bounce" />
        <span>
          Update <strong>{(update as any).version}</strong> available — downloading in the background…
        </span>
        <button onClick={dismissUpdate} className="ml-auto" aria-label="Dismiss">
          <X className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
        </button>
      </Banner>
    );
  }

  // ── 3. Back online flash ─────────────────────────────────────────────────
  if (justRecovered) {
    return (
      <Banner color="green">
        <Wifi className="w-3.5 h-3.5 shrink-0" />
        <span>Back online — AI features restored</span>
      </Banner>
    );
  }

  // ── 4. Offline / server unreachable ──────────────────────────────────────
  if (!checking && !aiAvailable) {
    return (
      <Banner color="red">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span>
          {isOnline
            ? "Can't reach AstraNovaAI servers — AI features unavailable"
            : "Offline — AI features unavailable. All other features work normally."}
        </span>
        <button
          onClick={recheck}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs opacity-80 hover:opacity-100"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </Banner>
    );
  }

  return null;
}

// ── Shared banner shell ───────────────────────────────────────────────────────

const COLORS = {
  indigo: {
    bg:     "rgba(99,102,241,0.15)",
    border: "rgba(99,102,241,0.3)",
    text:   "#a5b4fc",
  },
  green: {
    bg:     "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.2)",
    text:   "#86efac",
  },
  red: {
    bg:     "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.2)",
    text:   "#fca5a5",
  },
};

function Banner({
  color,
  children,
}: {
  color: keyof typeof COLORS;
  children: React.ReactNode;
}) {
  const { bg, border, text } = COLORS[color];
  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium"
      style={{ background: bg, borderBottom: `1px solid ${border}`, color: text }}
    >
      {children}
    </div>
  );
}
