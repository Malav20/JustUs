Add-Type -AssemblyName System.Drawing

$sourcePath = "c:\Vedora Labs\JustUs\App Logo and Splash Screen.png"
if (-not (Test-Path $sourcePath)) {
    Write-Error "Source image not found at $sourcePath"
    exit 1
}

$sourceImg = [System.Drawing.Image]::FromFile($sourcePath)

function Resize-ImageSquare {
    param(
        [System.Drawing.Image]$source,
        [int]$size,
        [string]$destPath
    )
    $dir = [System.IO.Path]::GetDirectoryName($destPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($source, 0, 0, $size, $size)
    $g.Dispose()

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated square: $destPath ($size x $size)"
}

function Resize-ForegroundIcon {
    param(
        [System.Drawing.Image]$source,
        [int]$size,
        [string]$destPath
    )
    $dir = [System.IO.Path]::GetDirectoryName($destPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Adaptive foreground: draw the logo taking ~72% of the canvas centered
    $innerSize = [int]($size * 0.72)
    $offset = [int](($size - $innerSize) / 2)
    $g.DrawImage($source, $offset, $offset, $innerSize, $innerSize)
    $g.Dispose()

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated foreground icon: $destPath ($size x $size)"
}

function Generate-Splash {
    param(
        [System.Drawing.Image]$source,
        [int]$width,
        [int]$height,
        [string]$destPath
    )
    $dir = [System.IO.Path]::GetDirectoryName($destPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Dark Theme Background Color #090A12
    $bgColor = [System.Drawing.Color]::FromArgb(255, 9, 10, 18)
    $g.Clear($bgColor)

    # Logo size in splash: fit proportionally (max 65% of width or height)
    $minDim = [Math]::Min($width, $height)
    $logoSize = [int]($minDim * 0.60)
    if ($logoSize -lt 120) { $logoSize = $minDim }

    $x = [int](($width - $logoSize) / 2)
    $y = [int](($height - $logoSize) / 2)

    $g.DrawImage($source, $x, $y, $logoSize, $logoSize)
    $g.Dispose()

    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated splash: $destPath ($width x $height)"
}

# 1. Public Web Assets
Resize-ImageSquare -source $sourceImg -size 512 -destPath "c:\Vedora Labs\JustUs\apps\web\public\logo.png"
Resize-ImageSquare -source $sourceImg -size 512 -destPath "c:\Vedora Labs\JustUs\apps\web\public\app-logo.png"
Resize-ImageSquare -source $sourceImg -size 192 -destPath "c:\Vedora Labs\JustUs\apps\web\public\icon.png"
Resize-ImageSquare -source $sourceImg -size 64 -destPath "c:\Vedora Labs\JustUs\apps\web\public\favicon.png"
Generate-Splash -source $sourceImg -width 2048 -height 2048 -destPath "c:\Vedora Labs\JustUs\apps\web\public\splash.png"

# 2. iOS App Assets
Resize-ImageSquare -source $sourceImg -size 1024 -destPath "c:\Vedora Labs\JustUs\apps\web\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"
Generate-Splash -source $sourceImg -width 2732 -height 2732 -destPath "c:\Vedora Labs\JustUs\apps\web\ios\App\App\Assets.xcassets\Splash.imageset\splash-2732x2732.png"
Generate-Splash -source $sourceImg -width 2732 -height 2732 -destPath "c:\Vedora Labs\JustUs\apps\web\ios\App\App\Assets.xcassets\Splash.imageset\splash-2732x2732-1.png"
Generate-Splash -source $sourceImg -width 2732 -height 2732 -destPath "c:\Vedora Labs\JustUs\apps\web\ios\App\App\Assets.xcassets\Splash.imageset\splash-2732x2732-2.png"

# 3. Android App Icons
$androidRes = "c:\Vedora Labs\JustUs\apps\web\android\app\src\main\res"

$densities = @(
    @{ name = "mipmap-mdpi"; size = 48; fgSize = 108 },
    @{ name = "mipmap-hdpi"; size = 72; fgSize = 162 },
    @{ name = "mipmap-xhdpi"; size = 96; fgSize = 216 },
    @{ name = "mipmap-xxhdpi"; size = 144; fgSize = 324 },
    @{ name = "mipmap-xxxhdpi"; size = 192; fgSize = 432 }
)

foreach ($d in $densities) {
    $dir = Join-Path $androidRes $d.name
    Resize-ImageSquare -source $sourceImg -size $d.size -destPath (Join-Path $dir "ic_launcher.png")
    Resize-ImageSquare -source $sourceImg -size $d.size -destPath (Join-Path $dir "ic_launcher_round.png")
    Resize-ForegroundIcon -source $sourceImg -size $d.fgSize -destPath (Join-Path $dir "ic_launcher_foreground.png")
}

# 4. Android Splash Screens
$splashScreens = @(
    @{ dir = "drawable"; w = 480; h = 800 },
    @{ dir = "drawable-port-mdpi"; w = 320; h = 480 },
    @{ dir = "drawable-port-hdpi"; w = 480; h = 800 },
    @{ dir = "drawable-port-xhdpi"; w = 720; h = 1280 },
    @{ dir = "drawable-port-xxhdpi"; w = 960; h = 1600 },
    @{ dir = "drawable-port-xxxhdpi"; w = 1280; h = 1920 },
    @{ dir = "drawable-land-mdpi"; w = 480; h = 320 },
    @{ dir = "drawable-land-hdpi"; w = 800; h = 480 },
    @{ dir = "drawable-land-xhdpi"; w = 1280; h = 720 },
    @{ dir = "drawable-land-xxhdpi"; w = 1600; h = 960 },
    @{ dir = "drawable-land-xxxhdpi"; w = 1920; h = 1280 }
)

foreach ($s in $splashScreens) {
    $targetDir = Join-Path $androidRes $s.dir
    Generate-Splash -source $sourceImg -width $s.w -height $s.h -destPath (Join-Path $targetDir "splash.png")
}

# 5. Extension Icons
$extPublic = "c:\Vedora Labs\JustUs\extension\public"
Resize-ImageSquare -source $sourceImg -size 16 -destPath (Join-Path $extPublic "icon16.png")
Resize-ImageSquare -source $sourceImg -size 32 -destPath (Join-Path $extPublic "icon32.png")
Resize-ImageSquare -source $sourceImg -size 48 -destPath (Join-Path $extPublic "icon48.png")
Resize-ImageSquare -source $sourceImg -size 128 -destPath (Join-Path $extPublic "icon128.png")

$extDist = "c:\Vedora Labs\JustUs\extension\dist"
if (Test-Path $extDist) {
    Resize-ImageSquare -source $sourceImg -size 16 -destPath (Join-Path $extDist "icon16.png")
    Resize-ImageSquare -source $sourceImg -size 32 -destPath (Join-Path $extDist "icon32.png")
    Resize-ImageSquare -source $sourceImg -size 48 -destPath (Join-Path $extDist "icon48.png")
    Resize-ImageSquare -source $sourceImg -size 128 -destPath (Join-Path $extDist "icon128.png")
}

$sourceImg.Dispose()
Write-Host "All assets generated successfully!"
