import Foundation
import UIKit
import MetricKit
import Darwin

// Diagnostic-only build: never reads clinical stores, messages, credentials or URLs.
final class EchoDiagnostics: NSObject, MXMetricManagerSubscriber {
  static let shared = EchoDiagnostics()
  private let queue = DispatchQueue(label: "echo.diagnostics", qos: .utility)
  private var timer: DispatchSourceTimer?
  private var samples = 0
  private let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("EchoDiagnostics", isDirectory: true)

  func start() {
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var directory = folder
    try? directory.setResourceValues(values)
    let current = folder.appendingPathComponent("startup.jsonl")
    let previous = folder.appendingPathComponent("previous-startup.jsonl")
    // Rotate only diagnostic files; never touch application data.
    if FileManager.default.fileExists(atPath: current.path) {
      try? FileManager.default.removeItem(at: previous)
      try? FileManager.default.moveItem(at: current, to: previous)
    }
    record("native_launch")
    MXMetricManager.shared.add(self)
    NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: nil) { _ in self.record("memory_warning") }
    NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil) { _ in self.record("background") }
    NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: nil) { _ in self.record("foreground") }
  }

  func beginApp() {
    record("react_start_requested")
    // A bounded trail: at most 60 small samples, independent of AsyncStorage.
    let source = DispatchSource.makeTimerSource(queue: queue)
    source.schedule(deadline: .now(), repeating: 1)
    source.setEventHandler { [weak self] in
      guard let self = self else { return }
      self.samples += 1
      self.write("startup_sample")
      if self.samples >= 60 { self.timer?.cancel(); self.timer = nil }
    }
    timer = source
    source.resume()
  }

  func record(_ phase: String) { queue.async { self.write(phase) } }
  private func write(_ phase: String) {
    var info = mach_task_basic_info()
    var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
      }
    }
    let row: [String: Any] = ["phase": phase, "time": ISO8601DateFormatter().string(from: Date()), "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown", "residentBytes": result == KERN_SUCCESS ? info.resident_size : 0]
    guard var data = try? JSONSerialization.data(withJSONObject: row) else { return }
    data.append(10)
    let file = folder.appendingPathComponent("startup.jsonl")
    if !FileManager.default.fileExists(atPath: file.path) { FileManager.default.createFile(atPath: file.path, contents: nil) }
    guard let handle = try? FileHandle(forWritingTo: file) else { return }
    defer { try? handle.close() }
    do { try handle.seekToEnd(); try handle.write(contentsOf: data) } catch {}
  }

  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    queue.async {
      for payload in payloads {
        let data = payload.jsonRepresentation()
        // Apple's crash/hang stacks and resource diagnostics; no app text captured.
        guard data.count <= 4 * 1024 * 1024 else { continue }
        let url = self.folder.appendingPathComponent("apple-\(UUID().uuidString).json")
        try? data.write(to: url, options: .atomic)
      }
      let files = ((try? FileManager.default.contentsOfDirectory(at: self.folder, includingPropertiesForKeys: [.creationDateKey])) ?? []).filter { $0.lastPathComponent.hasPrefix("apple-") }.sorted { ((try? $0.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast) > ((try? $1.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast) }
      for file in files.dropFirst(5) { try? FileManager.default.removeItem(at: file) }
    }
  }

  func export(completion: @escaping (URL?) -> Void) {
    queue.async {
      var report: [String: Any] = ["format": "echo-native-diagnostics-v1", "note": "MetricKit reports may arrive later. Missing reports do not rule out a crash, watchdog or memory termination."]
      let files = (try? FileManager.default.contentsOfDirectory(at: self.folder, includingPropertiesForKeys: [.fileSizeKey])) ?? []
      for file in files {
        guard let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 4 * 1024 * 1024, let data = try? Data(contentsOf: file) else { continue }
        report[file.lastPathComponent] = String(data: data, encoding: .utf8)
      }
      let output = FileManager.default.temporaryDirectory.appendingPathComponent("Echo-Diagnostics.json")
      let data = try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
      do { try data?.write(to: output, options: .atomic); DispatchQueue.main.async { completion(data == nil ? nil : output) } }
      catch { DispatchQueue.main.async { completion(nil) } }
    }
  }
}

final class EchoDiagnosticLaunchController: UIViewController {
  var launch: (() -> Void)?
  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground
    let title = UILabel()
    title.text = "Echo Diagnostic Build"
    title.font = .preferredFont(forTextStyle: .title1)
    title.numberOfLines = 0
    let detail = UILabel()
    detail.text = "Your saved data is unchanged. Tap Launch Echo to reproduce the issue. If Echo closes, reopen it and export diagnostics here. Apple crash/hang reports may arrive later. Diagnostics stay on this phone until you share them."
    detail.font = .preferredFont(forTextStyle: .body)
    detail.numberOfLines = 0
    let start = UIButton(type: .system)
    start.setTitle("Launch Echo", for: .normal)
    start.addTarget(self, action: #selector(startApp), for: .touchUpInside)
    let export = UIButton(type: .system)
    export.setTitle("Export Diagnostics", for: .normal)
    export.addTarget(self, action: #selector(exportData), for: .touchUpInside)
    let stack = UIStackView(arrangedSubviews: [title, detail, start, export])
    stack.axis = .vertical
    stack.spacing = 24
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24), stack.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
  }
  @objc private func startApp() {
    guard let action = launch else { return }
    launch = nil
    EchoDiagnostics.shared.beginApp()
    action()
  }
  @objc private func exportData() {
    EchoDiagnostics.shared.export { [weak self] url in
      guard let self = self, let url = url else { return }
      let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
      sheet.popoverPresentationController?.sourceView = self.view
      sheet.popoverPresentationController?.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
      self.present(sheet, animated: true)
    }
  }
}
