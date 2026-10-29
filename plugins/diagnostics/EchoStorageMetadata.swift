import Foundation
import CryptoKit

// Matches installed AsyncStorage 2.2.0 iOS paths. Reads file attributes, never values.
enum EchoStorageMetadata {
  static var directories: [URL] {
    let fm = FileManager.default
    let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let documents = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return [support.appendingPathComponent(Bundle.main.bundleIdentifier ?? "com.oppersmedical.echo"), documents]
      .map { $0.appendingPathComponent("RCTAsyncLocalStorage_V1") }
  }
  static func filename(_ key: String) -> String {
    Insecure.MD5.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
  }
  static func size(_ url: URL) throws -> UInt64 {
    guard FileManager.default.fileExists(atPath: url.path) else { return 0 }
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    guard attributes[.type] as? FileAttributeType == .typeRegular,
      let bytes = attributes[.size] as? NSNumber else { throw CocoaError(.fileReadUnknown) }
    return bytes.uint64Value
  }
  static func canReadPreview(_ key: String, roots: [URL] = directories) -> Bool {
    guard key.hasPrefix("echo-assistant-tail-"), key.utf8.count <= 1024 else { return false }
    do {
      for root in roots {
        if try size(root.appendingPathComponent("manifest.json")) > 4 * 1024 * 1024 { return false }
        if try size(root.appendingPathComponent(filename(key))) > 192 * 1024 { return false }
      }
      return true
    } catch { return false }
  }
  static func inventory() -> [String: Any] {
    let keys = ["echo-chat", "patient-dictations-store", "dictation-store", "operative-email-receipts-v1", "echo-assistant-outbox-v1", "echo-assistant-tail-home"]
    var sizes: [String: UInt64] = [:]
    for (index, root) in directories.enumerated() {
      for key in keys {
        sizes["store\(index):\(key)"] = try? size(root.appendingPathComponent(filename(key)))
      }
      sizes["store\(index):manifest"] = try? size(root.appendingPathComponent("manifest.json"))
    }
    return ["fileBytes": sizes]
  }
}
