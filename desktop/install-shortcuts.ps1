# Creates "TuneDeck" shortcuts (Desktop + Start Menu) for the packaged app in dist/.
$exe = Join-Path $PSScriptRoot "dist\TuneDeck-win32-x64\TuneDeck.exe"
if (-not (Test-Path $exe)) { throw "Build first: npm run package" }
$shell = New-Object -ComObject WScript.Shell
$targets = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "TuneDeck.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "TuneDeck.lnk")
)
foreach ($lnk in $targets) {
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = $exe
  $s.WorkingDirectory = Split-Path $exe
  $s.IconLocation = "$exe,0"
  $s.Description = "Sends your TuneDeck videos to your phone and tablet"
  $s.Save()
  Write-Output "Shortcut: $lnk"
}
