; NSIS Installer/Uninstaller Custom Hooks for Billing Software
; Ensures complete wipe of database, transaction history, images, and activation upon uninstalling from Windows
; When the user uninstalls and reinstalls, no old data will remain.

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Cleaning up Billing Software database, transaction history, and local files..."
  RMDir /r "$LOCALAPPDATA\com.billing.software"
  RMDir /r "$APPDATA\com.billing.software"
  RMDir /r "$LOCALAPPDATA\com.billing.pos"
  RMDir /r "$APPDATA\com.billing.pos"
  RMDir /r "$INSTDIR\license"
  Delete "$INSTDIR\license\activation.dat"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DetailPrint "Finalizing cleanup of application directory..."
  RMDir /r "$LOCALAPPDATA\com.billing.software"
  RMDir /r "$APPDATA\com.billing.software"
  RMDir /r "$LOCALAPPDATA\com.billing.pos"
  RMDir /r "$APPDATA\com.billing.pos"
  RMDir /r "$INSTDIR"
!macroend
