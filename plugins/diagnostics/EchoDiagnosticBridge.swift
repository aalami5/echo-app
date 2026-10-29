import Foundation
import React
@objc(EchoDiagnosticBridge)
class EchoDiagnosticBridge: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }
  @objc func mark(_ phase: String) {
    let allowed: Set<String> = ["js_entry", "root_mounted", "fonts_ready", "settings_hydrated", "auth_load_requested", "js_fatal", "js_unhandled"]
    if allowed.contains(phase) { EchoDiagnostics.shared.record(phase) }
  }
  @objc func storageRead(_ category: String, phase: String, length: Double) {
    let categories: Set<String> = ["echo-chat", "patient-dictations-store", "dictation-store", "operative-email-receipts-v1", "echo-assistant-outbox-v1", "conversation-preview", "conversation-draft", "other"]
    guard categories.contains(category), ["requested", "completed", "failed"].contains(phase), length.isFinite, length >= 0 else { return }
    EchoDiagnostics.shared.storageRead(category, phase: phase, length: length)
  }
  @objc func canReadPreview(_ key: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(EchoStorageMetadata.canReadPreview(key))
  }
}
