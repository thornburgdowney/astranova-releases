/**
 * AstraNovaAI Desktop — Root App
 *
 * Layout:
 *   <AppBanner />   ← offline / update notifications (top of screen)
 *   <Sidebar />     ← navigation
 *   <main />        ← page content (routed)
 *
 * The useOnlineStatus and useAutoUpdater hooks run at the root level so
 * every page can read them via context without re-subscribing to events.
 */

import { createContext, useContext } from "react";
import { useOnlineStatus, OnlineStatus } from "./hooks/useOnlineStatus";
import { useAutoUpdater, UpdateState }  from "./hooks/useAutoUpdater";
import { AppBanner } from "./components/AppBanner";

// ── Context ───────────────────────────────────────────────────────────────────

interface AppContext {
  online: OnlineStatus;
  update: { state: UpdateState; install: () => void; dismiss: () => void };
}

const Ctx = createContext<AppContext | null>(null);

export function useAppContext(): AppContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppContext must be used inside <App>");
  return ctx;
}

// Convenience helper — any component can call this to check AI availability
export function useAiAvailable(): boolean {
  return useAppContext().online.aiAvailable;
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const online = useOnlineStatus();
  const { update, installUpdate, dismiss } = useAutoUpdater();

  return (
    <Ctx.Provider value={{ online, update: { state: update, install: installUpdate, dismiss } }}>
      <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">

        {/* ── Top banner: offline warning / update prompt ─────────────────── */}
        <AppBanner
          isOnline={online.isOnline}
          aiAvailable={online.aiAvailable}
          checking={online.checking}
          recheck={online.recheck}
          update={update}
          installUpdate={installUpdate}
          dismissUpdate={dismiss}
        />

        {/* ── Main layout ─────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar goes here — import your existing Sidebar component */}
          {/* <Sidebar /> */}

          <main className="flex-1 overflow-auto">
            {/* Router / pages go here */}
            {/* Example: <Router hook={useHashLocation}><Switch>...</Switch></Router> */}
          </main>
        </div>

      </div>
    </Ctx.Provider>
  );
}
