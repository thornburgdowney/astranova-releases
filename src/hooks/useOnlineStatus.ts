import { useState, useEffect, useRef, useCallback } from "react";

export interface OnlineStatus {
  /** Browser's navigator.onLine — immediate, no latency */
  isOnline: boolean;
  /** Confirmed reachability of the Vultr server — AI features gate on this */
  aiAvailable: boolean;
  /** True while the first check is still pending (show skeleton, not error) */
  checking: boolean;
  /** Force an immediate re-check (e.g. user clicks "Retry") */
  recheck: () => void;
}

const POLL_INTERVAL_MS  = 30_000;  // check every 30s while online
const RETRY_INTERVAL_MS =  5_000;  // retry every 5s while offline

export function useOnlineStatus(): OnlineStatus {
  const [isOnline,    setIsOnline]    = useState(navigator.onLine);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [checking,    setChecking]    = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleNext = useCallback((available: boolean) => {
    clearTimer();
    timerRef.current = setTimeout(
      runCheck,
      available ? POLL_INTERVAL_MS : RETRY_INTERVAL_MS
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runCheck = useCallback(async () => {
    // Fast-fail if browser itself says offline
    if (!navigator.onLine) {
      setIsOnline(false);
      setAiAvailable(false);
      setChecking(false);
      // Report to Electron main process
      (window as any).electronAPI?.reportOnlineStatus(false);
      scheduleNext(false);
      return;
    }

    setIsOnline(true);

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res   = await fetch("/api/online-status", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        const available = data.online === true;
        setAiAvailable(available);
        (window as any).electronAPI?.reportOnlineStatus(available);
        scheduleNext(available);
      } else {
        setAiAvailable(false);
        (window as any).electronAPI?.reportOnlineStatus(false);
        scheduleNext(false);
      }
    } catch {
      setAiAvailable(false);
      (window as any).electronAPI?.reportOnlineStatus(false);
      scheduleNext(false);
    } finally {
      setChecking(false);
    }
  }, [scheduleNext]);

  // Initial check + browser online/offline events
  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  runCheck(); };
    const onOffline = () => { setIsOnline(false); setAiAvailable(false); scheduleNext(false); };

    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);

    runCheck();

    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
      clearTimer();
    };
  }, [runCheck, scheduleNext]);

  return {
    isOnline,
    aiAvailable,
    checking,
    recheck: runCheck,
  };
}
