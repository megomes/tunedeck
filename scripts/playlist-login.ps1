# Signs the playlist sync in with a Windows password prompt (works in any terminal).
$secure = Read-Host "TuneDeck access code" -AsSecureString
$env:TUNEDECK_CODE = [System.Net.NetworkCredential]::new("", $secure).Password
try {
  node "$PSScriptRoot\playlist-sync.mjs" login
} finally {
  Remove-Item Env:TUNEDECK_CODE -ErrorAction SilentlyContinue
}
