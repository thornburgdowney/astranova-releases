import { useEffect, useState } from "react";

export type UpdateState =
  | { status: "idle" }
  | { status: "available";  version: string; releaseNotes?: string }
  | { status: "downloading"; percent: number }
  | { status: "ready";      version: string; releaseNotes?: string }
  | { status: "error";      message: string };

/**
 * Listens to auto-updater events forwarded from Electron main → preload → renderer.
 * Returns the current update state and an `installUpdate()` action.
 *
 * Usage:
 *   const { update, installUpdate } = useAutoUpdater();
 *   if (update.status === "ready") show restart banner
 */
export function useAutoUpdater() {
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return; // running in browser / dev without Electron

    api.onUpdateAvailable?.((info: any) => {
      setUpdate({
        status:       "available",
        version:      info.version,
        releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
      });
    });

    api.onUpdateDownloaded?.((info: any) => {
      setUpdate({
        status:       "ready",
        version:      info.version,
        releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
      });
    });
  }, []);

  const installUpdate = () => {
    (window as any).electronAPI?.installUpdate();
  };

  const dismiss = () => {
    setUpdate({ status: "idle" });
  };

  return { update, installUpdate, dismiss };
}
