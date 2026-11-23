# tools\publish.ps1 : copy the prototype into docs/ with site paths, then check the page locally before push
param([string]$Proto = 'E:\Apps\DeutschSpiel\tasks\world_v2\proto')
$d = Join-Path $PSScriptRoot '..\docs'
Copy-Item "$Proto\main.js","$Proto\furnish.js","$Proto\map.js" $d -Force
$t = (Get-Content "$Proto\index.html" -Raw -Encoding UTF8).Replace('node_modules/phaser/dist/phaser.min.js','phaser.min.js')
Set-Content "$d\index.html" $t -Encoding UTF8 -NoNewline
if ($t -match 'node_modules') { throw 'index.html still points to node_modules' }
'docs updated'
