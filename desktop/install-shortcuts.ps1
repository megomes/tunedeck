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

# Phones connect straight to the app over the local network (WebRTC + mDNS). Without an inbound
# rule Windows drops that traffic and phones stay on "Connecting...". Asks for admin (UAC) once.
$rule = Get-NetFirewallApplicationFilter -Program $exe -ErrorAction SilentlyContinue |
  Get-NetFirewallRule | Where-Object { $_.Direction -eq "Inbound" -and $_.Action -eq "Allow" -and $_.Enabled -eq "True" }
if ($rule) {
  Write-Output "Firewall: TuneDeck already allowed"
} else {
  $cmd = "New-NetFirewallRule -DisplayName 'TuneDeck' -Direction Inbound -Program '$exe' -Action Allow -Profile Private | Out-Null"
  try {
    Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile", "-Command", $cmd
    Write-Output "Firewall: allowed TuneDeck on private networks"
  } catch {
    Write-Warning "Firewall rule not added (admin prompt declined). Phones won't connect until TuneDeck is allowed in Windows Firewall."
  }
}
