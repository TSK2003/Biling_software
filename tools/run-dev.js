import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';

// 1. Free ports 1420 & 4123 if occupied by stale previous runs
try {
  if (os.platform() === 'win32') {
    execSync('powershell -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 1420,4123 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Stop-Process -Name \'aescion-pos\' -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  }
} catch {
  // Ignore
}

// 2. Prepare PATH with Cargo binaries
const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const env = {
  ...process.env,
  PATH: `${process.env.PATH || ''};${cargoBin}`,
};

console.log('Starting Billing APP...');

const child = spawn('npx', ['tauri', 'dev'], {
  stdio: 'inherit',
  env,
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
