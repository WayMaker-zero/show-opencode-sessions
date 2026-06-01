const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const binDir = path.join(__dirname, '..', 'bin');
const files = fs.readdirSync(binDir);

files.forEach(file => {
  if (file.startsWith('show-opencode-sessions') && !file.endsWith('.zip') && !file.endsWith('.tar.gz')) {
    const filePath = path.join(binDir, file);

    // Ensure executable permissions before packaging
    try {
      if (!file.endsWith('.exe')) {
        execSync(`chmod +x "${filePath}"`);
      }
    } catch (e) {
      console.warn('Could not chmod', file);
    }

    const isWindows = file.endsWith('.exe');
    const isMacos = file.includes('-macos-');

    if (isWindows) {
        // Zip for Windows
        const zipName = file.replace('.exe', '.zip');
        console.log(`Creating ${zipName}...`);
        try {
            execSync(`cd "${binDir}" && zip -q "${zipName}" "${file}"`);
            fs.unlinkSync(filePath);
        } catch(e) {
            console.warn(`Failed to zip ${file}. Is 'zip' command available?`);
        }
    } else if (isMacos) {
        // Wrap MacOS binary in a minimal .app bundle to prevent Terminal window from showing
        const appName = 'ShowOpencodeSessions.app';
        const appPath = path.join(binDir, appName);
        const macosDir = path.join(appPath, 'Contents', 'MacOS');
        const plistPath = path.join(appPath, 'Contents', 'Info.plist');
        const tarName = file + '.tar.gz';

        console.log(`Wrapping ${file} in a .app bundle and creating ${tarName}...`);

        try {
            // Create directory structure
            fs.mkdirSync(macosDir, { recursive: true });

            // Copy binary as the backend core
            const destBinaryPath = path.join(macosDir, 'show-opencode-sessions-backend');
            fs.copyFileSync(filePath, destBinaryPath);
            fs.chmodSync(destBinaryPath, '755');

            // Create launcher script that double-forks/detaches backend and exits immediately
            const launcherPath = path.join(macosDir, 'show-opencode-sessions');
            const launcherContent = `#!/bin/bash
DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
nohup "\$DIR/show-opencode-sessions-backend" >/dev/null 2>&1 &
exit 0
`;
            fs.writeFileSync(launcherPath, launcherContent, 'utf8');
            fs.chmodSync(launcherPath, '755');

            // Write minimal Info.plist
            const pkg = require('../package.json');
            const version = pkg.version || '1.0.6';
            const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>show-opencode-sessions</string>
    <key>CFBundleIdentifier</key>
    <string>com.habbylabs.show-opencode-sessions</string>
    <key>CFBundleName</key>
    <string>ShowOpencodeSessions</string>
    <key>CFBundleVersion</key>
    <string>\${version}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>LSUIElement</key>
    <string>1</string>
</dict>
</plist>`;
            fs.writeFileSync(plistPath, plistContent, 'utf8');

            // Tar the entire .app directory
            execSync(`cd "${binDir}" && tar -czf "${tarName}" "${appName}"`);

            // Cleanup temp .app directory and original raw binary
            fs.rmSync(appPath, { recursive: true, force: true });
            fs.unlinkSync(filePath);
        } catch (e) {
            console.error(`Failed to package macOS .app bundle for ${file}:`, e);
            // Fallback: just tar the raw binary if .app creation fails
            try {
                execSync(`cd "${binDir}" && tar -czf "${tarName}" "${file}"`);
                fs.unlinkSync(filePath);
            } catch (_) {}
        }
    } else {
        // Tar for Linux (raw binary)
        const tarName = file + '.tar.gz';
        console.log(`Creating ${tarName}...`);
        try {
            execSync(`cd "${binDir}" && tar -czf "${tarName}" "${file}"`);
            fs.unlinkSync(filePath);
        } catch(e) {
            console.warn(`Failed to tar ${file}. Is 'tar' command available?`);
        }
    }
  }
});
console.log('Packaging complete!');
