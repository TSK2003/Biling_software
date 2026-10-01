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
  execSync('cmd.exe /C "taskkill /F /IM billing* /T 2>nul & taskkill /F /IM msedgewebview2* /T 2>nul"', { stdio: 'ignore' });
  console.log('[OK] Processes terminated.');
} catch (e) {
  // Ignored if not running
}

const localAppData = process.env.LOCALAPPDATA;
const appData = process.env.APPDATA;
const programData = process.env.ProgramData || 'C:\\ProgramData';

const targets = [
  localAppData ? path.join(localAppData, 'com.billing.software') : null,
  localAppData ? path.join(localAppData, 'com.billing.pos') : null,
  localAppData ? path.join(localAppData, 'Billing Software') : null,
  localAppData ? path.join(localAppData, 'billing-software') : null,
  localAppData ? path.join(localAppData, 'Programs', 'Billing Software', 'license') : null,
  appData ? path.join(appData, 'com.billing.software') : null,
  appData ? path.join(appData, 'com.billing.pos') : null,
  appData ? path.join(appData, 'Billing Software') : null,
  appData ? path.join(appData, 'billing-software') : null,
  path.join(programData, 'com.billing.software'),
  path.join(programData, 'Billing Software'),
  path.join(programData, 'com.billing.pos'),
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

// Also use cmd rmdir for any multi-user profiles
try {
  execSync('cmd.exe /C "for /D %U in (C:\\Users\\*) do (rmdir /S /Q \"\"%~U\\AppData\\Local\\com.billing.software\"\" 2>nul & rmdir /S /Q \"\"%~U\\AppData\\Roaming\\com.billing.software\"\" 2>nul & rmdir /S /Q \"\"%~U\\AppData\\Local\\Billing Software\"\" 2>nul & rmdir /S /Q \"\"%~U\\AppData\\Roaming\\Billing Software\"\" 2>nul & rmdir /S /Q \"\"%~U\\AppData\\Local\\com.billing.pos\"\" 2>nul & rmdir /S /Q \"\"%~U\\AppData\\Roaming\\com.billing.pos\"\" 2>nul & rmdir /S /Q \"\"%~U\\AppData\\Local\\billing-software\"\" 2>nul & rmdir /S /Q \"\"%~U\\AppData\\Roaming\\billing-software\"\" 2>nul)"', { stdio: 'ignore' });
} catch (e) {
  // Ignored
}

console.log('\n[SUCCESS] Local data wipe complete! All old databases, bills, and licenses removed.');
console.log('Next app launch or install will require License Key activation and start completely fresh.');
console.log('========================================================\n');
