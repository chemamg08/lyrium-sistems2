Add-Type -AssemblyName System.Drawing
$publicDir = 'C:\Users\chema\OneDrive\Escritorio\Nueva carpeta (2)\24 de marzo\2\lyrium sistems2\frontend\public'
$pngPath = Join-Path $publicDir 'apple-touch-icon.png'
$icoPath = Join-Path $publicDir 'favicon.ico'
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
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$ms = New-Object System.IO.MemoryStream
$bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]1)
$bw.Write([Byte]0)
$bw.Write([Byte]0)
$bw.Write([Byte]0)
$bw.Write([Byte]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]32)
$bw.Write([UInt32]$pngBytes.Length)
$bw.Write([UInt32]22)
$bw.Write($pngBytes)
$bw.Close()
$fs.Close()
$ms.Close()
$graphics.Dispose()
$bitmap.Dispose()
$penMain.Dispose()
$penThin.Dispose()
