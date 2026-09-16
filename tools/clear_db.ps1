$localAppData = [System.Environment]::GetFolderPath('LocalApplicationData')
$dbPath = [System.IO.Path]::Combine($localAppData, 'com.billing.software', 'billing_software.db')

Write-Host "Checking DB Path: $dbPath"
if (Test-Path $dbPath) {
    Write-Host "Database found. Clearing demo products, bills, payments, and sequence..."
    
    # We can use sqlite3 or a simple rust script
    Add-Type -AssemblyName System.Data
    # Or rename the db file or run a sqlite script
} else {
    Write-Host "Database not found at $dbPath"
}
