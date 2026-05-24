Add-Type -AssemblyName System.Drawing
$size = 64
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(8, 8, 8))
$penMain = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 3.2)
$penMain.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penMain.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$penThin = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 2.4)
$penThin.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penThin.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($penMain, 32, 8, 32, 56)
$graphics.DrawLine($penMain, 8, 18, 56, 18)
$graphics.DrawLine($penThin, 14, 18, 10, 30)
$graphics.DrawLine($penThin, 14, 18, 18, 30)
$graphics.DrawArc($penThin, 10, 26, 8, 10, 0, 180)
$graphics.DrawLine($penThin, 50, 18, 46, 30)
$graphics.DrawLine($penThin, 50, 18, 54, 30)
$graphics.DrawArc($penThin, 46, 26, 8, 10, 0, 180)
$graphics.DrawLine($penMain, 26, 56, 38, 56)
$pngPath = Join-Path (Get-Location) 'test-icon.png'
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "saved:$pngPath"
