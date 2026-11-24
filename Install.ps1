#Requires -Version 5.1
<#
.SYNOPSIS
    Installs Infinitium Shell for Windows Terminal.

.DESCRIPTION
    Default mode adds a profile, color scheme, font settings, prompt and Start Menu
    shortcut to the Windows Terminal you already have. -Portable builds a fully
    self-contained copy of Windows Terminal with its own settings and theme.

.EXAMPLE
    .\Install.ps1

.EXAMPLE
    .\Install.ps1 -InstallFont -ApplyTheme

.EXAMPLE
    .\Install.ps1 -Portable -Force
#>
[CmdletBinding()]
param(
    [switch]$Portable,
    [switch]$ApplyTheme,
    [switch]$InstallFont,
    [switch]$DesktopShortcut,
    [switch]$Force,
    [string]$BackgroundImage
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $Root 'tools\Common.ps1')
$paths = Get-InfinitiumPaths
$script:LaunchTarget = $null

function Install-SupportFiles {
    New-Item -ItemType Directory -Force -Path $paths.DataDir | Out-Null
    Copy-Item (Join-Path $Root 'assets\infinitium.ico') $paths.Icon -Force
    Copy-Item (Join-Path $Root 'assets\infinitium.png') $paths.IconPng -Force

    $source = Join-Path $Root 'profile\infinitium-profile.ps1'
    if ((Test-Path -LiteralPath $paths.PromptScript) -and -not $Force) {
        Write-InfinitiumStep "keeping your existing prompt script (use -Force to overwrite)"
    }
    else {
        Copy-Item $source $paths.PromptScript -Force
    }
    Write-InfinitiumOk "prompt + assets in $($paths.DataDir)"
}

function Install-Fragment {
    $wt = Resolve-InfinitiumWtExe
    if (-not $wt) {
        throw "Windows Terminal (wt.exe) was not found. Install it from the Microsoft Store, or run '.\Install.ps1 -Portable' for a self-contained copy."
    }

    $pkg = Get-AppxPackage Microsoft.WindowsTerminal -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pkg -and ([version]$pkg.Version -lt [version]'1.24')) {
        Write-InfinitiumWarn "Windows Terminal $($pkg.Version) is older than 1.24; the profile icon will be ignored. Update Terminal for the full look."
    }

    New-Item -ItemType Directory -Force -Path $paths.FragmentDir | Out-Null
    Copy-Item (Join-Path $Root 'assets\infinitium.png') (Join-Path $paths.FragmentDir 'infinitium.png') -Force

    $json = Get-Content -LiteralPath (Join-Path $Root 'config\fragment.json') -Raw
    $json = $json.Replace('{{PROMPT_SCRIPT}}', $paths.PromptScript.Replace('\', '\\'))

    if ($BackgroundImage) {
        $resolved = Resolve-Path -LiteralPath $BackgroundImage -ErrorAction Stop
        $ext = [IO.Path]::GetExtension($resolved.Path).ToLowerInvariant()
        $name = "background$ext"
        Copy-Item -LiteralPath $resolved.Path (Join-Path $paths.FragmentDir $name) -Force
        $obj = $json | ConvertFrom-Json
        $obj.profiles[0] | Add-Member -NotePropertyName backgroundImage -NotePropertyValue $name -Force
        $obj.profiles[0] | Add-Member -NotePropertyName backgroundImageOpacity -NotePropertyValue 0.22 -Force
        $obj.profiles[0] | Add-Member -NotePropertyName backgroundImageStretchMode -NotePropertyValue 'uniformToFill' -Force
        $json = $obj | ConvertTo-Json -Depth 10
    }

    [IO.File]::WriteAllText($paths.FragmentFile, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-InfinitiumOk "profile and color scheme added to Windows Terminal"
}

function Install-Portable {
    $appDir = Join-Path $Root 'app'
    if (Test-Path -LiteralPath $appDir) {
        if (-not $Force) { throw "The app folder already exists. Re-run with -Force to replace it." }
        Remove-Item -LiteralPath $appDir -Recurse -Force
    }

    $version = $script:InfinitiumWtVersion
    $zip = Join-Path $env:TEMP "WindowsTerminal-$version-x64.zip"
    if (-not (Test-Path -LiteralPath $zip)) {
        $url = "https://github.com/microsoft/terminal/releases/download/v$version/Microsoft.WindowsTerminal_${version}_x64.zip"
        Write-InfinitiumStep "downloading Windows Terminal $version (about 12 MB)"
        $oldProgress = $ProgressPreference
        $ProgressPreference = 'SilentlyContinue'
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
        }
        finally {
            $ProgressPreference = $oldProgress
        }
    }

    Write-InfinitiumStep "extracting"
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($zip, $appDir)

    $exe = Join-Path $appDir 'WindowsTerminal.exe'
    if (-not (Test-Path -LiteralPath $exe)) {
        $found = Get-ChildItem -LiteralPath $appDir -Filter 'WindowsTerminal.exe' -Recurse | Select-Object -First 1
        if (-not $found) { throw "WindowsTerminal.exe was not found in the downloaded archive." }
        $exe = $found.FullName
    }
    $exeDir = Split-Path -Parent $exe

    New-Item -ItemType File -Force -Path (Join-Path $exeDir '.portable') | Out-Null
    $settingsDir = Join-Path $exeDir 'settings'
    New-Item -ItemType Directory -Force -Path $settingsDir | Out-Null

    $settings = Get-Content -LiteralPath (Join-Path $Root 'config\portable-settings.json') -Raw
    $settings = $settings.Replace('{{PROMPT_SCRIPT}}', $paths.PromptScript.Replace('\', '\\'))
    $settings = $settings.Replace('{{ICON}}', $paths.IconPng.Replace('\', '\\'))
    $themeObject = Get-InfinitiumThemeObject -Root $Root
    $indented = Add-InfinitiumIndent -Text $themeObject -Spaces 8
    $settings = $settings.Replace('"themes": []', '"themes": [' + "`r`n" + $indented + "`r`n" + '    ]')
    [IO.File]::WriteAllText((Join-Path $settingsDir 'settings.json'), $settings, (New-Object System.Text.UTF8Encoding($false)))

    $script:LaunchTarget = $exe
    Write-InfinitiumOk "portable copy ready in $appDir"
}

function Install-Shortcut {
    if (-not $script:LaunchTarget) { throw "No launch target was set." }
    $icon = $paths.Icon
    $shell = New-Object -ComObject WScript.Shell

    foreach ($lnk in @($paths.Shortcut)) {
        $sc = $shell.CreateShortcut($lnk)
        $sc.TargetPath = $script:LaunchTarget
        $sc.Arguments = '-p "' + $script:InfinitiumProfileName + '"'
        $sc.WorkingDirectory = $env:USERPROFILE
        $sc.IconLocation = "$icon,0"
        $sc.Description = $script:InfinitiumFullName
        $sc.Save()
    }
    Write-InfinitiumOk "Start Menu shortcut created"

    if ($DesktopShortcut) {
        $sc = $shell.CreateShortcut($paths.DesktopShortcut)
        $sc.TargetPath = $script:LaunchTarget
        $sc.Arguments = '-p "' + $script:InfinitiumProfileName + '"'
        $sc.WorkingDirectory = $env:USERPROFILE
        $sc.IconLocation = "$icon,0"
        $sc.Description = $script:InfinitiumFullName
        $sc.Save()
        Write-InfinitiumOk "desktop shortcut created"
    }

    $launcher = '@echo off' + "`r`n" + 'start "" "' + $script:LaunchTarget + '" -p "' + $script:InfinitiumProfileName + '"' + "`r`n"
    [IO.File]::WriteAllText((Join-Path $Root 'Launch.cmd'), $launcher, [Text.Encoding]::ASCII)
}

function Test-InfinitiumFont {
    $reg = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    $props = (Get-ItemProperty -Path $reg -ErrorAction SilentlyContinue).PSObject.Properties.Name
    if ($props | Where-Object { $_ -like 'JetBrainsMono Nerd Font Mono*' }) { return $true }
    foreach ($dir in @((Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'), (Join-Path $env:WINDIR 'Fonts'))) {
        if (Test-Path -LiteralPath (Join-Path $dir 'JetBrainsMonoNerdFontMono-Regular.ttf')) { return $true }
    }
    return $false
}

function Install-Fonts {
    $fontDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
    $reg = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    New-Item -ItemType Directory -Force -Path $fontDir | Out-Null
    New-Item -Path $reg -Force | Out-Null

    $base = 'https://raw.githubusercontent.com/ryanoasis/nerd-fonts/master/patched-fonts/JetBrainsMono/Ligatures'
    $weights = @('Regular', 'Bold', 'Italic', 'BoldItalic')
    foreach ($weight in $weights) {
        $file = "JetBrainsMonoNerdFontMono-$weight.ttf"
        $dest = Join-Path $fontDir $file
        if (-not (Test-Path -LiteralPath $dest)) {
            Write-InfinitiumStep "downloading $file"
            Invoke-WebRequest -Uri "$base/$file" -OutFile $dest -UseBasicParsing
        }
        New-ItemProperty -Path $reg -Name "JetBrainsMono Nerd Font Mono $weight (TrueType)" -Value $dest -PropertyType String -Force | Out-Null
    }

    if (-not ('Infinitium.NativeMethods' -as [type])) {
        Add-Type -Namespace Infinitium -Name NativeMethods -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("gdi32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
public static extern int AddFontResource(string lpFileName);
'@
    }
    foreach ($weight in $weights) {
        [void][Infinitium.NativeMethods]::AddFontResource((Join-Path $fontDir "JetBrainsMonoNerdFontMono-$weight.ttf"))
    }

    if (Test-InfinitiumFont) {
        Write-InfinitiumOk "JetBrainsMono Nerd Font Mono installed for this user"
    }
    else {
        Write-InfinitiumWarn "font files installed but not detected yet - sign out and back in if Terminal does not show it"
    }
}

Write-InfinitiumHead "Infinitium Shell  /  setup"
Write-InfinitiumStep "mode: $(if ($Portable) { 'portable (self-contained)' } else { 'Windows Terminal profile' })"

if ($InstallFont) { Install-Fonts }
Install-SupportFiles

if ($Portable) {
    if ($ApplyTheme) { Write-InfinitiumWarn "-ApplyTheme is not needed in portable mode; the theme is already in the portable settings file." }
    Install-Portable
    Install-Shortcut
}
else {
    Install-Fragment
    $script:LaunchTarget = Resolve-InfinitiumWtExe
    Install-Shortcut
    if ($ApplyTheme) {
        try {
            $backup = Set-InfinitiumThemeBlock -SettingsPath $paths.PackagedSettings -Root $Root
            Write-InfinitiumOk "window theme applied to Windows Terminal (backup: $([IO.Path]::GetFileName($backup)))"
        }
        catch {
            Write-InfinitiumWarn $_.Exception.Message
        }
    }
    else {
        Write-InfinitiumStep "window theme not applied (add -ApplyTheme for Mica tabs and custom tab colors)"
    }
}

if (-not (Test-InfinitiumFont)) {
    Write-InfinitiumWarn "JetBrainsMono Nerd Font Mono is missing - Terminal will fall back to its default font. Add it with: .\Install.ps1 -InstallFont"
}

Write-Host ""
Write-Host "  Ready. Launch from the Start Menu, or run .\Launch.cmd" -ForegroundColor White
Write-Host ""
