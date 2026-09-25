; NSIS Installer/Uninstaller Custom Hooks for Billing Software
; Ensures complete wipe of database, transaction history, images, and activation upon uninstalling from Windows
; When the user uninstalls and reinstalls, no old data will remain.

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Terminating any running Billing Software processes to release file locks..."
  nsExec::Exec 'taskkill /F /IM "billing-software.exe"'
  nsExec::Exec 'taskkill /F /IM "Billing Software.exe"'
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
!macroend
