param(
  [string]$DesktopPath = [Environment]::GetFolderPath("Desktop")
)

$ErrorActionPreference = "Stop"

$launcherPath = Join-Path $PSScriptRoot "Iniciar-Los-Anios-Maravillosos-Offline.cmd"
$iconPath = Join-Path $PSScriptRoot "los-anos-maravillosos.ico"
if (-not (Test-Path -LiteralPath $launcherPath) -or -not (Test-Path -LiteralPath $iconPath)) {
  exit 1
}

$shortcutName = "Los A" + [char]0x00F1 + "os Maravillosos.lnk"
$shortcutPath = Join-Path $desktopPath $shortcutName
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation = $iconPath + ",0"
$shortcut.Description = "Abrir Los A" + [char]0x00F1 + "os Maravillosos Offline"
$shortcut.WindowStyle = 7
$shortcut.Save()
