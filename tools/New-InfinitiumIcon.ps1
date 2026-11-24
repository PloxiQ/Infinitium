# Generates assets\infinitium.png (256px) and assets\infinitium.ico (multi-size).
# No external assets required; run once after cloning and keep the output.
[CmdletBinding()]
param(
    [string]$OutDir
)

$ErrorActionPreference = 'Stop'
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets' }
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function New-InfinitiumRoundRect {
    param([float]$X, [float]$Y, [float]$W, [float]$H, [float]$R)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $R * 2
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-InfinitiumBitmap {
    param([int]$Size)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $Size / 256.0
    $margin = [Math]::Max(1.0, 7 * $scale)

    $shape = New-InfinitiumRoundRect -X $margin -Y $margin -W ($Size - 2 * $margin) -H ($Size - 2 * $margin) -R (54 * $scale)
    $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $c1 = [System.Drawing.Color]::FromArgb(255, 110, 231, 249)
    $c2 = [System.Drawing.Color]::FromArgb(255, 199, 146, 234)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 40.0)
    $g.FillPath($brush, $shape)

    $edge = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(46, 255, 255, 255), [float](2 * $scale))
    $g.DrawPath($edge, $shape)

    # Lemniscate of Bernoulli, sampled and stroked.
    $stroke = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float](25 * $scale))
    $stroke.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $stroke.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $stroke.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $a = 92.0 * $scale
    $points = @()
    for ($i = 0; $i -le 240; $i++) {
        $t = 2 * [Math]::PI * $i / 240.0
        $sin = [Math]::Sin($t)
        $cos = [Math]::Cos($t)
        $den = 1 + ($sin * $sin)
        $x = 128 * $scale + ($a * $cos / $den)
        $y = 128 * $scale + ($a * $sin * $cos / $den) * 1.35
        $points += New-Object System.Drawing.PointF([float]$x, [float]$y)
    }
    $g.DrawLines($stroke, $points)

    $stroke.Dispose()
    $edge.Dispose()
    $brush.Dispose()
    $shape.Dispose()
    $g.Dispose()
    return $bmp
}

$pngPath = Join-Path $OutDir 'infinitium.png'
$big = New-InfinitiumBitmap -Size 256
$big.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "wrote $pngPath"

$sizes = @(256, 64, 48, 32, 16)
$pngData = New-Object System.Collections.ArrayList

foreach ($s in $sizes) {
    if ($s -eq 256) {
        $bmp = $big
    }
    else {
        $bmp = New-InfinitiumBitmap -Size $s
    }
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    [void]$pngData.Add($ms.ToArray())
    $ms.Dispose()
    if ($s -ne 256) { $bmp.Dispose() }
}

$icoPath = Join-Path $OutDir 'infinitium.ico'
$out = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($out)

$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$sizes.Count)

$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $writer.Write([byte]$dim)
    $writer.Write([byte]$dim)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$pngData[$i].Length)
    $writer.Write([uint32]$offset)
    $offset += $pngData[$i].Length
}

foreach ($data in $pngData) {
    $writer.Write([byte[]]$data)
}

$writer.Flush()
[IO.File]::WriteAllBytes($icoPath, $out.ToArray())
$writer.Dispose()
$out.Dispose()
$big.Dispose()

Write-Host "wrote $icoPath"
