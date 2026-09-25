; NSIS Installer/Uninstaller Custom Hooks for Billing Software
; Ensures complete wipe of database, transaction history, images, and activation upon fresh installation and uninstallation
; When the user installs or uninstalls, no old data will remain, and the app will require license activation.

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Preparing fresh installation: Stopping any running Billing Software or WebView processes..."
  nsExec::Exec 'taskkill /F /IM "billing-software.exe"'
  nsExec::Exec 'taskkill /F /IM "Billing Software.exe"'
  nsExec::Exec 'taskkill /F /IM "msedgewebview2.exe"'
  Sleep 1000

  DetailPrint "Wiping previous database and license for a fresh installation..."
  RMDir /r "$LOCALAPPDATA\com.billing.software"
  RMDir /r "$APPDATA\com.billing.software"
  RMDir /r "$LOCALAPPDATA\com.billing.pos"
  RMDir /r "$APPDATA\com.billing.pos"
  RMDir /r "$LOCALAPPDATA\Billing Software"
  RMDir /r "$APPDATA\Billing Software"
  RMDir /r "$INSTDIR\license"
  Delete "$INSTDIR\license\activation.dat"

  ; Clean across all user profiles on the machine
  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path ''C:\Users\*\AppData\Local\com.billing.software'', ''C:\Users\*\AppData\Roaming\com.billing.software'' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Terminating any running Billing Software and WebView processes to release file locks..."
  nsExec::Exec 'taskkill /F /IM "billing-software.exe"'
  nsExec::Exec 'taskkill /F /IM "Billing Software.exe"'
  nsExec::Exec 'taskkill /F /IM "msedgewebview2.exe"'
  Sleep 1000

  DetailPrint "Completely wiping Billing Software database, transaction history, and local files..."
  RMDir /r "$LOCALAPPDATA\com.billing.software"
  RMDir /r "$APPDATA\com.billing.software"
  RMDir /r "$LOCALAPPDATA\com.billing.pos"
  RMDir /r "$APPDATA\com.billing.pos"
  RMDir /r "$LOCALAPPDATA\Billing Software"
  RMDir /r "$APPDATA\Billing Software"
  RMDir /r "$INSTDIR\license"
  Delete "$INSTDIR\license\activation.dat"

  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path ''C:\Users\*\AppData\Local\com.billing.software'', ''C:\Users\*\AppData\Roaming\com.billing.software'' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "Finalizing complete cleanup of application and remaining data folders..."
  RMDir /r "$LOCALAPPDATA\com.billing.software"
  RMDir /r "$APPDATA\com.billing.software"
  RMDir /r "$LOCALAPPDATA\com.billing.pos"
  RMDir /r "$APPDATA\com.billing.pos"
  RMDir /r "$LOCALAPPDATA\Billing Software"
  RMDir /r "$APPDATA\Billing Software"
  RMDir /r "$INSTDIR"

  nsExec::Exec 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path ''C:\Users\*\AppData\Local\com.billing.software'', ''C:\Users\*\AppData\Roaming\com.billing.software'' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force"'
!macroend
