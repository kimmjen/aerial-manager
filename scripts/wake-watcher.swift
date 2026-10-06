// Aerial Manager wake watcher — works around the macOS Tahoe bug where the
// lock-screen aerial fails to resume after sleep (black/frozen frame).
// Restarting WallpaperAgent fixes it, so do that on system or display wake.
// Lock/unlock events are only logged, to help diagnose when the aerial stalls.
import AppKit

func log(_ msg: String) {
  print("\(ISO8601DateFormatter().string(from: Date())) \(msg)")
  fflush(stdout)
}

func restartWallpaperAgent(after event: String) {
  log("\(event) -> restart WallpaperAgent")
  DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/killall")
    p.arguments = ["WallpaperAgent"]
    try? p.run()
  }
}

let ws = NSWorkspace.shared.notificationCenter
for name in [NSWorkspace.didWakeNotification, NSWorkspace.screensDidWakeNotification] {
  ws.addObserver(forName: name, object: nil, queue: .main) { restartWallpaperAgent(after: $0.name.rawValue) }
}

let dc = DistributedNotificationCenter.default()
for name in ["com.apple.screenIsLocked", "com.apple.screenIsUnlocked"] {
  dc.addObserver(forName: Notification.Name(name), object: nil, queue: .main) { log($0.name.rawValue) }
}

log("ready")
RunLoop.main.run()
