import { execFile } from "child_process";
import { promisify } from "util";
import { INDEX_PLIST } from "./config";

const run = promisify(execFile);

const READ_SELECTED = `
import plistlib, sys
try:
    with open(sys.argv[1], "rb") as f:
        d = plistlib.load(f)
    cfg = d["AllSpacesAndDisplays"]["Linked"]["Content"]["Choices"][0]["Configuration"]
    print(plistlib.loads(cfg).get("assetID", ""))
except Exception:
    print("")
`;

const WRITE_SELECTED = `
import plistlib, sys
path, uid = sys.argv[1], sys.argv[2]
with open(path, "rb") as f:
    d = plistlib.load(f)
def update(node):
    choice = node["Linked"]["Content"]["Choices"][0]
    cfg = plistlib.loads(choice["Configuration"])
    cfg["assetID"] = uid
    choice["Configuration"] = plistlib.dumps(cfg, fmt=plistlib.FMT_BINARY)
for key in ("AllSpacesAndDisplays", "SystemDefault"):
    if key in d:
        update(d[key])
with open(path, "wb") as f:
    plistlib.dump(d, f, fmt=plistlib.FMT_BINARY)
`;

/** UUID of the aerial currently shown on the lock screen, or null. */
export async function getSelectedSlot(): Promise<string | null> {
  const { stdout } = await run("python3", ["-c", READ_SELECTED, INDEX_PLIST]);
  const uuid = stdout.trim();
  return uuid || null;
}

export async function setSelectedSlot(uuid: string): Promise<void> {
  await run("python3", ["-c", WRITE_SELECTED, INDEX_PLIST, uuid]);
  await restartWallpaperAgent();
}

/** Restart so file/selection changes take effect. Agent relaunches on demand. */
export async function restartWallpaperAgent(): Promise<void> {
  await run("killall", ["WallpaperAgent"]).catch(() => {});
  await run("killall", ["WallpaperAerialsExtension"]).catch(() => {});
}
