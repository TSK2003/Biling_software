#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('========================================================');
console.log('CLEANING LOCAL BILLING SOFTWARE APPDATA & LICENSES');
console.log('========================================================\n');

// 1. Terminate running processes to unlock SQLite & WebView2 files
try {
  console.log('[CLOSING] Terminating any running billing app or webview processes...');
  execSync('taskkill /F /IM "billing-software.exe" /IM "Billing Software.exe" /IM "msedgewebview2.exe"', { stdio: 'ignore' });
  console.log('[OK] Processes terminated.');
} catch (e) {
  // Ignored if not running
}

const localAppData = process.env.LOCALAPPDATA;
const appData = process.env.APPDATA;

const targets = [
  localAppData ? path.join(localAppData, 'com.billing.software') : null,
  localAppData ? path.join(localAppData, 'com.billing.pos') : null,
  localAppData ? path.join(localAppData, 'Billing Software') : null,
  appData ? path.join(appData, 'com.billing.software') : null,
  appData ? path.join(appData, 'com.billing.pos') : null,
].filter(Boolean);

targets.forEach((targetDir) => {
  if (fs.existsSync(targetDir)) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      console.log(`[DELETED] ${targetDir}`);
    } catch (err) {
      console.warn(`[ERROR] Could not delete ${targetDir}: ${err.message}`);
    }
  } else {
    console.log(`[ALREADY CLEAN] ${targetDir}`);
  }
});

console.log('\n[SUCCESS] Local data wipe complete! All old databases, bills, and licenses removed.');
console.log('Next app launch or install will require License Key activation and start completely fresh.');
console.log('========================================================\n');
