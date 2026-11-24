#Requires -Version 5.1
<#
.SYNOPSIS
    Removes Infinitium Shell.

.DESCRIPTION
    Deletes the Windows Terminal fragment, shortcuts, prompt files and the managed
    theme block. Your other Terminal settings are left alone. Use -Purge to also
    delete the portable app folder, and -RemoveFont to remove the Nerd Font.

.EXAMPLE
    .\Uninstall.ps1

.EXAMPLE
    .\Uninstall.ps1 -Purge -RemoveFont
#>
[CmdletBinding()]
param(
    [switch]$Purge,
    [switch]$RemoveFont,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $Root 'tools\Common.ps1')
$paths = Get-InfinitiumPaths

Write-InfinitiumHead "Infinitium Shell  /  uninstall"

if (Test-Path -LiteralPath $paths.FragmentDir) {
    Remove-Item -LiteralPath $paths.FragmentDir -Recurse -Force
    Write-InfinitiumOk "Windows Terminal profile removed"
}
else {
    Write-InfinitiumStep "no Windows Terminal profile found"
}

foreach ($lnk in @($paths.Shortcut, $paths.DesktopShortcut)) {
    if (Test-Path -LiteralPath $lnk) {
        Remove-Item -LiteralPath $lnk -Force
        Write-InfinitiumOk "removed $([IO.Path]::GetFileName($lnk))"
    }
}

$backup = Remove-InfinitiumThemeBlock -SettingsPath $paths.PackagedSettings
if ($backup) {
    Write-InfinitiumOk "theme block removed (backup: $([IO.Path]::GetFileName($backup)))"
}

if (Test-Path -LiteralPath $paths.DataDir) {
    Remove-Item -LiteralPath $paths.DataDir -Recurse -Force
    Write-InfinitiumOk "prompt and assets removed"
}

$launcher = Join-Path $Root 'Launch.cmd'
if (Test-Path -LiteralPath $launcher) { Remove-Item -LiteralPath $launcher -Force }

$appDir = Join-Path $Root 'app'
if ($Purge -and (Test-Path -LiteralPath $appDir)) {
    $confirmed = $Force
    if (-not $confirmed) {
        $answer = Read-Host "Delete the portable app folder at $appDir ? [y/N]"
        $confirmed = $answer -match '^(y|yes)$'
    }
    if ($confirmed) {
        Remove-Item -LiteralPath $appDir -Recurse -Force
        Write-InfinitiumOk "portable app folder deleted"
    }
    else {
        Write-InfinitiumStep "kept $appDir"
    }
}

if ($RemoveFont) {
    $reg = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts'
    $fontDir = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'
    foreach ($weight in @('Regular', 'Bold', 'Italic', 'BoldItalic')) {
        $label = "JetBrainsMono Nerd Font Mono $weight (TrueType)"
        Remove-ItemProperty -Path $reg -Name $label -ErrorAction SilentlyContinue
        $file = Join-Path $fontDir "JetBrainsMonoNerdFontMono-$weight.ttf"
        if (Test-Path -LiteralPath $file) {
            Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
        }
    }
    Write-InfinitiumOk "Nerd Font entries removed (sign out to fully unload the font)"
}

Write-Host ""
Write-Host "  Done. Open a new Terminal window to see the change." -ForegroundColor White
Write-Host ""
