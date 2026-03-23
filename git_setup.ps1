$ErrorActionPreference = "Stop"
$GitPath = "C:\Program Files\Git\cmd\git.exe"

$output = @()
$output += & $GitPath status 2>&1
$output += & $GitPath add . 2>&1
$output += & $GitPath commit -m "Initial commit to GitHub" 2>&1
$output += & $GitPath branch -M main 2>&1
$output += & $GitPath remote add origin https://github.com/dillahbaraja/nasab-al-baraja.git 2>&1
$output += & $GitPath push -u origin main 2>&1

$output | Out-File -FilePath .\git_output.txt -Encoding utf8
