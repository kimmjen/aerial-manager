import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { AERIALS_DIR, BACKUP_DIR, FFMPEG, LibraryDirKey } from "./config";
import { probeMeta } from "./codec";
import { readMapping, writeMapping, SlotSource } from "./mapping";
import { resolveLibraryFile } from "./paths";
import { ffmpegArgs } from "./transcode";
import { getSelectedSlot, restartWallpaperAgent } from "./wallpaper";

const run = promisify(execFile);

const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

export interface SlotInfo {
  uuid: string;
  size: number | null;
  source: SlotSource | null;
  hasBackup: boolean;
  isSelected: boolean;
}

export function isSlotUuid(uuid: string): boolean {
  return UUID_RE.test(uuid);
}

export function assertSlotUuid(uuid: string): string {
  if (!isSlotUuid(uuid)) throw new Error(`unknown slot: ${uuid}`);
  return uuid;
}

export function slotPath(uuid: string): string {
  return path.join(AERIALS_DIR, `${uuid}.mov`);
}

function backupPath(uuid: string): string {
  return path.join(BACKUP_DIR, `${uuid}.mov`);
}

/** Discover aerial slots by scanning the wallpaper videos folder. */
export function listSlotUuids(): string[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(AERIALS_DIR);
  } catch {
    return []; // no aerials downloaded yet (or not macOS Tahoe)
  }
  return names
    .filter((n) => n.toLowerCase().endsWith(".mov") && isSlotUuid(n.slice(0, -4)))
    .map((n) => n.slice(0, -4).toUpperCase())
    .sort();
}

export async function getSlots(): Promise<SlotInfo[]> {
  const mapping = readMapping();
  const selected = (await getSelectedSlot())?.toUpperCase() ?? null;
  return listSlotUuids().map((uuid) => {
    let size: number | null = null;
    try {
      size = fs.statSync(slotPath(uuid)).size;
    } catch {
      // slot file disappeared between readdir and stat
    }
    return {
      uuid,
      size,
      source: mapping[uuid] ?? null,
      hasBackup: fs.existsSync(backupPath(uuid)),
      isSelected: uuid === selected,
    };
  });
}

/** Write a library video into a slot, normalized for the lock screen. Does not restart the agent. */
async function writeSlotFromSource(uuid: string, dir: LibraryDirKey, name: string): Promise<void> {
  const src = resolveLibraryFile(dir, name);
  if (!fs.existsSync(src)) throw new Error(`source not found: ${name}`);
  if (!fs.existsSync(slotPath(uuid))) throw new Error(`slot not found: ${uuid}`);

  // Never lose an original: back it up before the first overwrite.
  const mapping = readMapping();
  if (!mapping[uuid] && !fs.existsSync(backupPath(uuid))) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(slotPath(uuid), backupPath(uuid));
  }

  const meta = await probeMeta(src);
  const tmp = slotPath(uuid) + ".tmp.mov";
  try {
    await run(FFMPEG, ffmpegArgs(meta, src, tmp));
    fs.renameSync(tmp, slotPath(uuid));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  fs.chmodSync(slotPath(uuid), 0o600);

  mapping[uuid] = { dir, name, appliedAt: new Date().toISOString() };
  writeMapping(mapping);
}

/** Apply a library video to a slot (normalized for the lock screen) and restart the agent. */
export async function applyToSlot(uuid: string, dir: LibraryDirKey, name: string): Promise<void> {
  await writeSlotFromSource(uuid, dir, name);
  await restartWallpaperAgent();
}

export interface ReapplyResult {
  uuid: string;
  name: string;
  ok: boolean;
  error?: string;
}

/**
 * Re-apply every slot that currently holds a custom video, running each through
 * the current normalization. Originals have no mapping entry and are skipped.
 * Restarts the agent once at the end.
 */
export async function reapplyAll(): Promise<ReapplyResult[]> {
  const mapping = readMapping();
  const results: ReapplyResult[] = [];
  for (const [uuid, source] of Object.entries(mapping)) {
    try {
      await writeSlotFromSource(uuid, source.dir, source.name);
      results.push({ uuid, name: source.name, ok: true });
    } catch (e) {
      results.push({ uuid, name: source.name, ok: false, error: String(e) });
    }
  }
  await restartWallpaperAgent();
  return results;
}

/** Restore the original Apple aerial from backup. */
export async function restoreSlot(uuid: string): Promise<void> {
  const backup = backupPath(uuid);
  if (!fs.existsSync(backup)) throw new Error(`no backup for slot: ${uuid}`);
  fs.copyFileSync(backup, slotPath(uuid));
  fs.chmodSync(slotPath(uuid), 0o600);

  const mapping = readMapping();
  delete mapping[uuid];
  writeMapping(mapping);
  await restartWallpaperAgent();
}
