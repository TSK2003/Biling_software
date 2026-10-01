; NSIS Installer/Uninstaller Custom Hooks for Billing Software
; Guarantees complete, clean wipe of all databases, licenses, shop configurations,
; transaction history, receipts, WebView2 user cache, and activation state.
; When uninstalled, NO trace of license or data remains.
; Upon reinstallation, the application will always start 100% fresh and prompt
; for full license activation and initial setup details.

; Explicitly bind our multi-resolution Aescion company icon to the installer and uninstaller PE headers
Icon "D:\AESCION\Work\Demo_Projects\Billing_Software\src-tauri\icons\icon.ico"
UninstallIcon "D:\AESCION\Work\Demo_Projects\Billing_Software\src-tauri\icons\icon.ico"

!macro KILL_BILLING_PROCESSES
  DetailPrint "Terminating any running Billing Software and WebView processes to release file locks..."
  nsExec::Exec 'cmd.exe /C "taskkill /F /IM billing* /T 2>nul & taskkill /F /IM msedgewebview2* /T 2>nul"'
  Sleep 1000
!macroend

!macro PURGE_ALL_DATA
  DetailPrint "Completely wiping Billing Software database, transaction history, licenses, and local files..."

  ; 1. Delete under current user context ($LOCALAPPDATA and $APPDATA)
  SetShellVarContext current
  RMDir /r "$LOCALAPPDATA\com.billing.software"
  RMDir /r "$APPDATA\com.billing.software"
  RMDir /r "$LOCALAPPDATA\com.billing.pos"
  RMDir /r "$APPDATA\com.billing.pos"
  RMDir /r "$LOCALAPPDATA\Billing Software"
  RMDir /r "$APPDATA\Billing Software"
  RMDir /r "$LOCALAPPDATA\billing-software"
  RMDir /r "$APPDATA\billing-software"
  RMDir /r "$INSTDIR\license"
  Delete "$INSTDIR\license\activation.dat"

  ; 2. Delete under all users / machine context ($APPDATA with SetShellVarContext all points to C:\ProgramData)
  SetShellVarContext all
  RMDir /r "$LOCALAPPDATA\com.billing.software"
  RMDir /r "$APPDATA\com.billing.software"
  RMDir /r "$APPDATA\Billing Software"
  RMDir /r "$APPDATA\com.billing.pos"
  RMDir /r "$APPDATA\billing-software"

  ; 3. Clean across all Windows user profiles using native cmd loop
  nsExec::Exec 'cmd.exe /C "for /D %U in (C:\Users\*) do (rmdir /S /Q ""%~U\AppData\Local\com.billing.software"" 2>nul & rmdir /S /Q ""%~U\AppData\Roaming\com.billing.software"" 2>nul & rmdir /S /Q ""%~U\AppData\Local\Billing Software"" 2>nul & rmdir /S /Q ""%~U\AppData\Roaming\Billing Software"" 2>nul & rmdir /S /Q ""%~U\AppData\Local\com.billing.pos"" 2>nul & rmdir /S /Q ""%~U\AppData\Roaming\com.billing.pos"" 2>nul & rmdir /S /Q ""%~U\AppData\Local\billing-software"" 2>nul & rmdir /S /Q ""%~U\AppData\Roaming\billing-software"" 2>nul) & rmdir /S /Q ""C:\ProgramData\Billing Software"" 2>nul & rmdir /S /Q ""C:\ProgramData\com.billing.software"" 2>nul"'
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KILL_BILLING_PROCESSES
  !insertmacro PURGE_ALL_DATA
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Force Tauri's built-in DeleteAppDataCheckboxState to 1 so its own internal deletion routine always runs
  StrCpy $DeleteAppDataCheckboxState 1

  !insertmacro KILL_BILLING_PROCESSES
  !insertmacro PURGE_ALL_DATA
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro PURGE_ALL_DATA
  SetShellVarContext current
  RMDir /r "$INSTDIR"
  SetShellVarContext all
  RMDir /r "$INSTDIR"
!macroend
