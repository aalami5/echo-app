import Foundation
import React
@objc(EchoDiagnosticBridge)
class EchoDiagnosticBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }
  @objc func mark(_ phase: String) {
    let allowed: Set<String> = ["js_entry", "root_mounted", "fonts_ready", "settings_hydrated", "auth_load_requested", "js_fatal", "js_unhandled"]
    if allowed.contains(phase) { EchoDiagnostics.shared.record(phase) }
  }
}
