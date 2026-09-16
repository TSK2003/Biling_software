$connections = Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue
if ($connections) {
    $pids = $connections.OwningProcess | Select-Object -Unique
    foreach ($pidToKill in $pids) {
        Write-Host "Stopping process PID: $pidToKill on port 1420"
        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
    }
}

Stop-Process -Name "aescion-pos" -Force -ErrorAction SilentlyContinue
Write-Host "Port 1420 is now free."
