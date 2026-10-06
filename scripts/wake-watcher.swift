// Aerial Manager wake watcher — works around the macOS Tahoe bug where the
// lock-screen aerial fails to resume after sleep (black/frozen frame).
// Restarting WallpaperAgent fixes it (like re-locking), so do that whenever the
// lock screen comes up or the system/display wakes. Unlock is only logged.
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
dc.addObserver(forName: Notification.Name("com.apple.screenIsLocked"), object: nil, queue: .main) {
  restartWallpaperAgent(after: $0.name.rawValue)
}
dc.addObserver(forName: Notification.Name("com.apple.screenIsUnlocked"), object: nil, queue: .main) {
  log($0.name.rawValue)
}

log("ready")
RunLoop.main.run()
