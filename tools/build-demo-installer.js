#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

console.log('========================================================');
console.log('BUILDING DEMO INSTALLER (WITH 100+ DEMO PRODUCTS)');
console.log('========================================================\n');

const env = { ...process.env, DEMO_DATA: '1' };

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tauri', 'build', '--features', 'demo-data'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env,
    shell: true,
  }
);

child.on('close', (code) => {
  if (code === 0) {
    console.log('\n========================================================');
    console.log('✓ DEMO DATA INSTALLER BUILT SUCCESSFULLY!');
    console.log('Target: src-tauri/target/release/bundle/nsis/');
    console.log('All 116 demo products across 8 categories pre-loaded!');
    console.log('========================================================');
  } else {
    console.error(`\nBuild failed with exit code ${code}`);
    process.exit(code || 1);
  }
});
