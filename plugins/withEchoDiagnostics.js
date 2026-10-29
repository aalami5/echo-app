const { withDangerousMod, withXcodeProject, withAppDelegate } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');
module.exports = function withEchoDiagnostics(config) {
  config = withDangerousMod(config, ['ios', async c => {
    const root = path.join(c.modRequest.platformProjectRoot, c.modRequest.projectName);
    fs.mkdirSync(root, { recursive: true });
    for (const file of ['EchoDiagnostics.swift', 'EchoDiagnosticBridge.swift', 'EchoDiagnosticBridge.m', 'EchoStorageMetadata.swift']) {
      fs.copyFileSync(path.join(__dirname, 'diagnostics', file), path.join(root, file));
    }
    return c;
  }]);
  config = withXcodeProject(config, c => {
    const name = c.modRequest.projectName;
    for (const file of ['EchoDiagnostics.swift', 'EchoDiagnosticBridge.swift', 'EchoDiagnosticBridge.m', 'EchoStorageMetadata.swift']) {
      const source = `${name}/${file}`;
      if (!c.modResults.hasFile(source)) c.modResults.addSourceFile(source, undefined, c.modResults.findPBXGroupKey({ name }));
    }
    return c;
  });
  return withAppDelegate(config, c => {
    if (c.modResults.language !== 'swift') throw new Error('Echo diagnostics requires Swift AppDelegate');
    let source = c.modResults.contents;
    if (source.includes('EchoDiagnosticLaunchController')) return c;
    const launch = /factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)/;
    if (!launch.test(source)) throw new Error('React launch anchor not found; refusing silent instrumentation failure');
    source = source.replace(launch, `EchoDiagnostics.shared.start()
    let diagnosticScreen = EchoDiagnosticLaunchController()
    diagnosticScreen.launch = { [weak self] in
      guard let self = self else { return }
      factory.startReactNative(withModuleName: "main", in: self.window, launchOptions: launchOptions)
    }
    window?.rootViewController = diagnosticScreen
    window?.makeKeyAndVisible()`);
    c.modResults.contents = source;
    return c;
  });
};
