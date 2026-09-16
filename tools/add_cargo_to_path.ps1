$cargoBin = [System.IO.Path]::Combine($env:USERPROFILE, '.cargo', 'bin')
$userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')

if ($userPath -notlike "*$cargoBin*") {
    $newPath = "$userPath;$cargoBin"
    [System.Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host "Added to User PATH: $cargoBin"
} else {
    Write-Host "Cargo bin already in User PATH: $cargoBin"
}
