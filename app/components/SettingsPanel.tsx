"use client";

import { useEffect, useState } from "react";
import { api, type AppConfig } from "../api";

interface Props {
  firstRun: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Desktop-only settings: library folders, backup folder, import from the web app. */
export default function SettingsPanel({ firstRun, onClose, onSaved }: Props) {
  // fields this screen doesn't edit (e.g. ffmpegPath) are kept as saved
  const [saved, setSaved] = useState<AppConfig>({ libraryDirs: [] });
  const [libraryDirs, setLibraryDirs] = useState<string[]>([]);
  const [backupDir, setBackupDir] = useState("");
  const [restartOnLock, setRestartOnLock] = useState(true);
  const [legacyHelper, setLegacyHelper] = useState(false);
  // first run: on, so lock/wake keep being handled after a reboot
  const [atLogin, setAtLogin] = useState(firstRun);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.settings().then((s) => {
      setSaved(s.config);
      setLibraryDirs(s.config.libraryDirs.length ? s.config.libraryDirs : s.libraryDirs);
      setBackupDir(s.config.backupDir ?? s.backupDir);
      setRestartOnLock(s.restartOnLock);
      setLegacyHelper(s.legacyHelperInstalled);
    }, (e) => setError(String(e)));
    if (!firstRun) api.launchAtLogin().then(setAtLogin, (e) => setError(String(e)));
  }, [firstRun]);

  async function addFolder() {
    const dir = await api.pickFolder();
    if (dir && !libraryDirs.includes(dir)) setLibraryDirs([...libraryDirs, dir]);
  }

  async function changeBackup() {
    const dir = await api.pickFolder();
    if (dir) setBackupDir(dir);
  }

  async function importLegacy() {
    setError(null);
    const file = await api.pickSlotsJson();
    if (!file) return;
    try {
      const n = await api.importLegacySlots(file);
      setNotice(`Imported ${n} slot record${n === 1 ? "" : "s"}.`);
      onSaved();
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeLegacyHelper() {
    setError(null);
    try {
      await api.removeLegacyHelper();
      setLegacyHelper(false);
    } catch (e) {
      setError(String(e));
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.saveSettings({ ...saved, libraryDirs, backupDir, restartOnLock });
      await api.setLaunchAtLogin(atLogin);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-5" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="glass-raised glass-menu w-full max-w-xl rounded-[24px] p-5 sm:p-6">
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-[var(--text)]">Settings</h2>
        {firstRun && (
          <p className="mb-4 text-sm text-[var(--text-dim)]">Pick the folders that hold your videos to get started.</p>
        )}

        <section className="mt-4">
          <h3 className="section-title mb-2">Library folders</h3>
          <ul className="mb-2 flex flex-col gap-1.5">
            {libraryDirs.map((dir, i) => (
              <li key={dir} className="glass flex items-center gap-2 rounded-[12px] px-3 py-2">
                <span className="min-w-0 truncate font-mono text-xs text-[var(--text)]" title={dir}>
                  {dir}
                </span>
                {i === 0 && <span className="shrink-0 text-[10px] text-[var(--text-faint)]">imports go here</span>}
                <button
                  onClick={() => setLibraryDirs(libraryDirs.filter((d) => d !== dir))}
                  disabled={libraryDirs.length === 1}
                  className="btn btn-ghost btn-danger ml-auto shrink-0 px-2.5 py-1 text-xs"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button onClick={addFolder} className="btn btn-glass px-3 py-1.5 text-xs">
            Add folder…
          </button>
        </section>

        <section className="mt-5">
          <h3 className="section-title mb-2">Backups of Apple originals</h3>
          <div className="glass flex items-center gap-2 rounded-[12px] px-3 py-2">
            <span className="min-w-0 truncate font-mono text-xs text-[var(--text)]" title={backupDir}>
              {backupDir}
            </span>
            <button onClick={changeBackup} className="btn btn-ghost ml-auto shrink-0 px-2.5 py-1 text-xs">
              Change…
            </button>
          </div>
        </section>

        <section className="mt-5">
          <h3 className="section-title mb-2">Lock screen</h3>
          <label className="flex items-start gap-2.5 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={restartOnLock}
              onChange={(e) => setRestartOnLock(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              Refresh the wallpaper every time the screen locks
              <span className="block text-xs text-[var(--text-dim)]">
                Fixes a black or frozen lock screen on Macs that rarely sleep. It always refreshes after waking.
              </span>
            </span>
          </label>
          <label className="mt-3 flex items-start gap-2.5 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={atLogin}
              onChange={(e) => setAtLogin(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              Open at login
              <span className="block text-xs text-[var(--text-dim)]">
                Starts in the menu bar so the lock screen keeps working after a restart. Closing the window keeps it
                running there.
              </span>
            </span>
          </label>
        </section>

        {legacyHelper && (
          <section className="glass mt-5 rounded-[12px] p-3">
            <p className="text-xs text-[var(--text-dim)]">
              The old wake helper from the web app is still installed. This app does the same job now, so remove it
              to avoid refreshing twice.
            </p>
            <button onClick={removeLegacyHelper} className="btn btn-ghost btn-danger mt-2 px-3 py-1.5 text-xs">
              Remove old helper
            </button>
          </section>
        )}

        <section className="mt-5">
          <h3 className="section-title mb-2">Coming from the web app?</h3>
          <p className="mb-2 text-xs text-[var(--text-dim)]">
            Import its <code className="font-mono">data/slots.json</code> so the app knows which of your videos are in
            which slot (needed for Restore).
          </p>
          <button onClick={importLegacy} className="btn btn-glass px-3 py-1.5 text-xs">
            Import slots.json…
          </button>
        </section>

        {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
        {notice && <p className="mt-4 text-sm text-[var(--live)]">{notice}</p>}

        <div className="mt-6 flex justify-end gap-2">
          {!firstRun && (
            <button onClick={onClose} className="btn btn-ghost px-4 py-2 text-sm">
              Cancel
            </button>
          )}
          <button onClick={save} disabled={saving || libraryDirs.length === 0} className="btn btn-primary px-4 py-2 text-sm">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
