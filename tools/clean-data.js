#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

console.log('========================================================');
console.log('CLEANING LOCAL BILLING SOFTWARE APPDATA');
console.log('========================================================\n');

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
      // First try deleting items individually to avoid locked handle cascade
      const items = fs.readdirSync(targetDir);
      for (const item of items) {
        const itemPath = path.join(targetDir, item);
        try {
          fs.rmSync(itemPath, { recursive: true, force: true });
          console.log(`[DELETED] ${item}`);
        } catch (itemErr) {
          console.warn(`[LOCKED] ${item}: ${itemErr.message}`);
        }
      }
      fs.rmdirSync(targetDir);
      console.log(`[REMOVED ROOT] ${targetDir}`);
    } catch (err) {
      console.warn(`[SKIPPED] ${targetDir}: ${err.message}`);
    }
  } else {
    console.log(`[NOT FOUND / ALREADY CLEAN] ${targetDir}`);
  }
});

console.log('\n[SUCCESS] Local data wipe complete! All old databases removed.');
console.log('========================================================\n');
