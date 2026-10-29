import Foundation
let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: root) }
let key = "echo-assistant-tail-home"
precondition(EchoStorageMetadata.filename(key) == "26be97eaacf709643c0dc1d331963995")
precondition(EchoStorageMetadata.canReadPreview(key, roots: [root]))
let file = root.appendingPathComponent(EchoStorageMetadata.filename(key))
FileManager.default.createFile(atPath: file.path, contents: Data("synthetic".utf8))
precondition(EchoStorageMetadata.canReadPreview(key, roots: [root]))
let handle = try FileHandle(forWritingTo: file)
try handle.truncate(atOffset: 3 * 1024 * 1024 * 1024)
try handle.close()
precondition(!EchoStorageMetadata.canReadPreview(key, roots: [root]))
let unchangedSize = try EchoStorageMetadata.size(file)
precondition(unchangedSize == 3 * 1024 * 1024 * 1024)
precondition(!EchoStorageMetadata.canReadPreview("patient-dictations-store", roots: [root]))
print("Swift metadata preflight passed: 3GB sparse preview rejected without reading or changing it")
