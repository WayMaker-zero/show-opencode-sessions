const fs = require('fs');

const code = fs.readFileSync('opencode-api.ts', 'utf-8');

// replace SessionMessage and SessionDetail definitions
// also update getSessionDetail to return all parts

// We'll just edit the file with node script to make it robust.
