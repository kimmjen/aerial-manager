// Aerial Manager wake watcher — works around the macOS Tahoe bug where the
// lock-screen aerial fails to resume after sleep (black/frozen frame).
// Restarting WallpaperAgent fixes it (like re-locking), so do that when the
// system/display wakes and whenever the lock screen comes up — Macs that rarely
// sleep only ever see the lock. --no-restart-on-lock limits it to wake.
import AppKit

func log(_ msg: String) {
  print("\(ISO8601DateFormatter().string(from: Date())) \(msg)")
  fflush(stdout)
}

// Lock and wake often arrive together; coalesce them into one restart.
var pendingRestart: DispatchWorkItem?

func restartWallpaperAgent(after event: String) {
  log("\(event) -> restart WallpaperAgent")
  pendingRestart?.cancel()
  let work = DispatchWorkItem {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/killall")
    p.arguments = ["WallpaperAgent"]
    try? p.run()
  }
  pendingRestart = work
  DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
}

let ws = NSWorkspace.shared.notificationCenter
for name in [NSWorkspace.didWakeNotification, NSWorkspace.screensDidWakeNotification] {
  ws.addObserver(forName: name, object: nil, queue: .main) { restartWallpaperAgent(after: $0.name.rawValue) }
}

let dc = DistributedNotificationCenter.default()
let restartOnLock = !CommandLine.arguments.contains("--no-restart-on-lock")
dc.addObserver(forName: Notification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) {
  if restartOnLock { restartWallpaperAgent(after: $0.name.rawValue) } else { log($0.name.rawValue) }
}
dc.addObserver(forName: Notification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) {
  log($0.name.rawValue)
}

log("ready (restart on lock: \(restartOnLock))")
RunLoop.main.run()
