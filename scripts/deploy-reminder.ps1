# Zips the reminder job (backend/reminder plus the shared schedule code) and uploads it
# to the rsvpReminder Lambda created by infra/reminder.yaml. Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File scripts/deploy-reminder.ps1
param([string]$AwsProfile = "matt-claude", [string]$Region = "ap-southeast-2")
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path ([IO.Path]::GetTempPath()) "natural20-reminder"
$zip = Join-Path ([IO.Path]::GetTempPath()) "natural20-reminder.zip"
Remove-Item -Recurse -Force $stage, $zip -ErrorAction SilentlyContinue

# Same folder layout as the repo, so the relative import of the schedule code works.
New-Item -ItemType Directory -Force "$stage\backend\reminder", "$stage\src\assets\js\lib" | Out-Null
Copy-Item "$root\backend\reminder\*.mjs" "$stage\backend\reminder\"
Copy-Item "$root\src\assets\js\lib\schedule.js" "$stage\src\assets\js\lib\"
Set-Content -Encoding ascii "$stage\package.json" '{ "type": "module" }'
Set-Content -Encoding ascii "$stage\index.mjs" 'export { handler } from "./backend/reminder/index.mjs";'

# Windows' own tar writes forward-slash paths, which Lambda (Linux) needs.
& "$env:SystemRoot\System32\tar.exe" -a -c -f $zip -C $stage package.json index.mjs backend src
if ($LASTEXITCODE -ne 0) { throw "Zipping failed" }

aws lambda update-function-code --function-name rsvpReminder --zip-file "fileb://$zip" `
  --profile $AwsProfile --region $Region --query "[FunctionName,CodeSize,LastUpdateStatus]" --output text
if ($LASTEXITCODE -ne 0) { throw "Upload failed" }
