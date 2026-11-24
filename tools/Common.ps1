# Shared paths, constants and helper functions for the Infinitium Shell package.
# Dot-sourced by Install.ps1 and Uninstall.ps1.

$script:InfinitiumDirName     = 'Infinitium'
$script:InfinitiumFullName    = 'Infinitium Shell'
$script:InfinitiumProfileName = 'Infinitium Shell'
$script:InfinitiumSchemeName  = 'Infinitium Dark'
$script:InfinitiumThemeName   = 'Infinitium'
$script:InfinitiumProfileGuid = '{a9b5b8ca-a546-5004-9cb1-d3f52449a7d2}'
$script:InfinitiumWtVersion   = '1.25.3131.0'

function Get-InfinitiumPaths {
    $dataDir = Join-Path $env:LOCALAPPDATA $script:InfinitiumDirName
    $fragRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows Terminal\Fragments'
    [pscustomobject]@{
        DataDir          = $dataDir
        PromptScript     = Join-Path $dataDir 'infinitium-profile.ps1'
        Icon             = Join-Path $dataDir 'infinitium.ico'
        IconPng          = Join-Path $dataDir 'infinitium.png'
        FragmentRoot     = $fragRoot
        FragmentDir      = Join-Path $fragRoot $script:InfinitiumDirName
        FragmentFile     = Join-Path (Join-Path $fragRoot $script:InfinitiumDirName) 'infinitium.json'
        PackagedSettings = Join-Path $env:LOCALAPPDATA 'Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json'
        StartMenu        = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
        Shortcut         = Join-Path (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs') "$($script:InfinitiumFullName).lnk"
        DesktopShortcut  = Join-Path ([Environment]::GetFolderPath('Desktop')) "$($script:InfinitiumFullName).lnk"
    }
}

function Write-InfinitiumStep([string]$Message) {
    Write-Host "  $Message" -ForegroundColor Gray
}

function Write-InfinitiumOk([string]$Message) {
    Write-Host "  [ok] $Message" -ForegroundColor Green
}

function Write-InfinitiumWarn([string]$Message) {
    Write-Host "  [!!] $Message" -ForegroundColor Yellow
}

function Write-InfinitiumHead([string]$Message) {
    Write-Host ""
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host ""
}

function Backup-InfinitiumFile([string]$Path) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $dir = [IO.Path]::GetDirectoryName($Path)
    $name = [IO.Path]::GetFileNameWithoutExtension($Path)
    $backup = Join-Path $dir "$name.backup-$stamp.json"
    Copy-Item -LiteralPath $Path -Destination $backup -Force
    return $backup
}

function Remove-InfinitiumThemeText([string]$Text) {
    $pattern = '(?ms)^[ \t]*// >>> Infinitium Shell theme.*?^[ \t]*// <<< Infinitium Shell theme[^\r\n]*(\r?\n)?'
    return [regex]::Replace($Text, $pattern, '')
}

function Get-InfinitiumThemeObject {
    param([string]$Root)
    $themeFile = Join-Path (Join-Path $Root 'config') 'theme.json'
    return ([IO.File]::ReadAllText($themeFile)).Trim()
}

function Add-InfinitiumIndent {
    param([string]$Text, [int]$Spaces)
    $pad = ' ' * $Spaces
    $lines = $Text -split "\r?\n"
    return (($lines | ForEach-Object { $pad + $_ }) -join "`r`n")
}

function Set-InfinitiumThemeBlock([string]$SettingsPath, [string]$Root) {
    if (-not (Test-Path -LiteralPath $SettingsPath)) {
        throw "Windows Terminal settings.json was not found at:`n  $SettingsPath"
    }
    $raw = [IO.File]::ReadAllText($SettingsPath)
    $raw = Remove-InfinitiumThemeText $raw

    if ($raw -match '"theme"\s*:') {
        throw "settings.json already sets a `"theme`". Remove that entry or use portable mode instead."
    }

    $themeObject = Get-InfinitiumThemeObject -Root $Root
    $indented = Add-InfinitiumIndent -Text $themeObject -Spaces 8
    $arrayBlock = "    // >>> Infinitium Shell theme (managed by Install.ps1 -ApplyTheme)`r`n" +
                  $indented + "`r`n" +
                  "    // <<< Infinitium Shell theme`r`n"

    $empty = [regex]::Match($raw, '"themes"\s*:\s*\[\s*\]')
    if ($empty.Success) {
        $replacement = '"themes": [' + "`r`n" + $arrayBlock + '    ]'
        $raw = $raw.Substring(0, $empty.Index) + $replacement + $raw.Substring($empty.Index + $empty.Length)
    }
    elseif ($raw -match '"themes"\s*:') {
        throw "settings.json already defines a non-empty `"themes`" list, so Infinitium will not touch it. Remove that entry or use portable mode instead."
    }
    else {
        $open = $raw.IndexOf('{')
        if ($open -lt 0) { throw "settings.json is not a JSON object." }
        $insert = "`r`n" + '    "themes": [' + "`r`n" + $arrayBlock + '    ],'
        $raw = $raw.Substring(0, $open + 1) + $insert + $raw.Substring($open + 1)
    }

    $open = $raw.IndexOf('{')
    $keyBlock = "// >>> Infinitium Shell theme`r`n" +
                '    "theme": "' + $script:InfinitiumThemeName + '",' + "`r`n" +
                "// <<< Infinitium Shell theme`r`n"
    $raw = $raw.Substring(0, $open + 1) + "`r`n" + $keyBlock + $raw.Substring($open + 1)

    $backup = Backup-InfinitiumFile $SettingsPath
    [IO.File]::WriteAllText($SettingsPath, $raw, (New-Object System.Text.UTF8Encoding($false)))
    return $backup
}

function Remove-InfinitiumThemeBlock([string]$SettingsPath) {
    if (-not (Test-Path -LiteralPath $SettingsPath)) { return $null }
    $raw = [IO.File]::ReadAllText($SettingsPath)
    if ($raw -notmatch '// >>> Infinitium Shell theme') { return $null }
    $new = Remove-InfinitiumThemeText $raw
    $backup = Backup-InfinitiumFile $SettingsPath
    [IO.File]::WriteAllText($SettingsPath, $new, (New-Object System.Text.UTF8Encoding($false)))
    return $backup
}

function Resolve-InfinitiumWtExe {
    $cmd = Get-Command wt.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $alias = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\wt.exe'
    if (Test-Path -LiteralPath $alias) { return $alias }
    return $null
}
