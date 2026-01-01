$newDir = "$env:USERPROFILE\.local\bin"
$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User')

if ($currentPath -notlike "*$newDir*") {
    [Environment]::SetEnvironmentVariable('PATH', "$currentPath;$newDir", 'User')
    Write-Host "PATH updated successfully. New directory added: $newDir"
    Write-Host "Please restart your terminal for changes to take effect."
} else {
    Write-Host "Directory already in PATH: $newDir"
}
