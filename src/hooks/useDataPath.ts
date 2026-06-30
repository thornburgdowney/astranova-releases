import { useState, useEffect } from 'react';

/**
 * Returns the OS path where AstraNovaAI stores its local database.
 * Only works when running inside Electron — returns null in a regular browser.
 *
 * Usage in Settings page:
 *   const dataPath = useDataPath();
 *   // → "C:\Users\Gabriel\AppData\Roaming\AstraNovaAI"  (Windows)
 *   // → "/Users/gabriel/Library/Application Support/AstraNovaAI"  (macOS)
 */
export function useDataPath(): string | null {
  const [dataPath, setDataPath] = useState<string | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.getUserDataPath) return; // not in Electron

    api.getUserDataPath().then((p: string) => setDataPath(p));
  }, []);

  return dataPath;
}

/**
 * Opens the data folder in Finder (macOS) or File Explorer (Windows).
 * No-op when not running in Electron.
 */
export function openDataFolder() {
  const api = (window as any).electronAPI;
  api?.openDataFolder?.();
}
