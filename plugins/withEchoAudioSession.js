const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFT_FILE = 'EchoAudioSession.swift';
const BRIDGE_FILE = 'EchoAudioSessionBridge.m';
const BRIDGING_IMPORT = '#import <React/RCTBridgeModule.h>';

const swiftSource = `import AVFoundation
import Foundation

@objc(EchoAudioSession)
class EchoAudioSession: NSObject {
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
        try session.overrideOutputAudioPort(.speaker)
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
        try session.overrideOutputAudioPort(.none)
        resolve(true)
      } catch {
        reject("audio_session_clear_speaker_failed", error.localizedDescription, error)
      }
    }
  }
}
`;

const bridgeSource = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(EchoAudioSession, NSObject)

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
