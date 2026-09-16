import { execSync } from 'child_process';
import os from 'os';

if (os.platform() === 'win32') {
  try {
    execSync(
      'powershell -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 1420,4123 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"',
      { stdio: 'ignore' }
    );
  } catch {
    // Ignore if no process found
  }
}
