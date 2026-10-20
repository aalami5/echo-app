const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_FILE = 'EchoAudioSession.swift';
const BRIDGE_FILE = 'EchoAudioSessionBridge.m';
const BRIDGING_IMPORT = '#import <React/RCTBridgeModule.h>\n#import <React/RCTEventEmitter.h>';

const swiftSource = `import AVFoundation
import Foundation

@objc(EchoAudioSession)
class EchoAudioSession: RCTEventEmitter {
  private var observing = false
  private var callActive = false
  override static func requiresMainQueueSetup() -> Bool { return true }
  override func supportedEvents() -> [String]! { return ["EchoAudioSessionEvent"] }
  override func startObserving() {
    observing = true
    NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
    NotificationCenter.default.addObserver(self, selector: #selector(reset(_:)), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
  }
  override func stopObserving() { observing = false; NotificationCenter.default.removeObserver(self) }
  private func pause(_ type: String) {
    guard callActive else { return }
    // Silence immediately in native code, even if JS is suspended.
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    if observing { sendEvent(withName: "EchoAudioSessionEvent", body: ["type": type]) }
  }
  @objc private func interrupted(_ note: Notification) {
    if let value = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
       value == AVAudioSession.InterruptionType.began.rawValue { pause("interruption") }
  }
  @objc private func routeChanged(_ note: Notification) {
    if let value = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
       value == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { pause("routeLost") }
  }
  @objc private func reset(_ note: Notification) { pause("reset") }

  @objc(forceSpeaker:rejecter:)
  func forceSpeaker(
    resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      do {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
          .playAndRecord,
          mode: .voiceChat,
          options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
        )
        try session.setActive(true)
        // Default to speaker only when no headset route is selected.
        try session.overrideOutputAudioPort(.none)
        self.callActive = true
        resolve(true)
      } catch {
        reject("audio_session_force_speaker_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(clearSpeakerOverride:rejecter:)
  func clearSpeakerOverride(
    resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      do {
        let session = AVAudioSession.sharedInstance()
        self.callActive = false
        try session.overrideOutputAudioPort(.none)
        try session.setActive(false, options: .notifyOthersOnDeactivation)
        resolve(true)
      } catch {
        reject("audio_session_clear_speaker_failed", error.localizedDescription, error)
      }
    }
  }
}
`;

const bridgeSource = `#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(EchoAudioSession, RCTEventEmitter)

RCT_EXTERN_METHOD(forceSpeaker:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(clearSpeakerOverride:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
`;

function withEchoAudioSession(config) {
  config = withDangerousMod(config, ['ios', async (modConfig) => {
    const iosRoot = modConfig.modRequest.platformProjectRoot;
    const projectName = modConfig.modRequest.projectName;
    const appRoot = path.join(iosRoot, projectName);
    fs.mkdirSync(appRoot, { recursive: true });
    fs.writeFileSync(path.join(appRoot, SWIFT_FILE), swiftSource);
    fs.writeFileSync(path.join(appRoot, BRIDGE_FILE), bridgeSource);

    const bridgingHeaderPath = path.join(appRoot, `${projectName}-Bridging-Header.h`);
    if (fs.existsSync(bridgingHeaderPath)) {
      const header = fs.readFileSync(bridgingHeaderPath, 'utf8');
      if (!header.includes(BRIDGING_IMPORT)) {
        fs.writeFileSync(bridgingHeaderPath, `${BRIDGING_IMPORT}\n${header}`);
      }
    }

    return modConfig;
  }]);

  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const projectName = modConfig.modRequest.projectName;
    const swiftPath = `${projectName}/${SWIFT_FILE}`;
    const bridgePath = `${projectName}/${BRIDGE_FILE}`;
    const appGroup = project.findPBXGroupKey({ name: projectName });

    if (!project.hasFile(swiftPath)) {
      project.addSourceFile(swiftPath, undefined, appGroup);
    }
    if (!project.hasFile(bridgePath)) {
      project.addSourceFile(bridgePath, undefined, appGroup);
    }

    return modConfig;
  });
}

module.exports = withEchoAudioSession;
