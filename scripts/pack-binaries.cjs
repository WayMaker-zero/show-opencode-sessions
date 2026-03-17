const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const binDir = path.join(__dirname, '..', 'bin');
const files = fs.readdirSync(binDir);

files.forEach(file => {
  if (file.startsWith('show-opencode-sessions') && !file.endsWith('.zip') && !file.endsWith('.tar.gz')) {
    const filePath = path.join(binDir, file);
    // Ensure executable permissions before zipping/tarring
    try {
      if (!file.endsWith('.exe')) {
        execSync(`chmod +x "${filePath}"`);
      }
    } catch (e) {
      console.warn('Could not chmod', file);
    }

    const isWindows = file.endsWith('.exe');
    if (isWindows) {
        // Zip for Windows
        const zipName = file.replace('.exe', '.zip');
        console.log(`Creating ${zipName}...`);
        try {
            execSync(`cd "${binDir}" && zip -q "${zipName}" "${file}"`);
            // Remove the raw binary to avoid confusion when distributing
            fs.unlinkSync(filePath);
        } catch(e) {
            console.warn(`Failed to zip ${file}. Is 'zip' command available?`);
        }
    } else {
        // Tar for MacOS/Linux
        const tarName = file + '.tar.gz';
        console.log(`Creating ${tarName}...`);
        try {
            execSync(`cd "${binDir}" && tar -czf "${tarName}" "${file}"`);
            // Remove the raw binary to avoid confusion when distributing
            fs.unlinkSync(filePath);
        } catch(e) {
            console.warn(`Failed to tar ${file}. Is 'tar' command available?`);
        }
    }
  }
});
console.log('Packaging complete!');
