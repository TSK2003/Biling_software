#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('========================================================');
console.log('BUILDING PRODUCTION INSTALLER');
console.log('========================================================\n');

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tauri', 'build'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  }
);

child.on('close', (code) => {
  if (code === 0) {
    console.log('\n========================================================');
    console.log('✓ PRODUCTION INSTALLER BUILT SUCCESSFULLY!');
    console.log('Target: src-tauri/target/release/bundle/nsis/');
    console.log('========================================================');
  } else {
    console.error(`\nBuild failed with exit code ${code}`);
    process.exit(code || 1);
  }
});
