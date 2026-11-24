# Infinitium Shell profile (Windows PowerShell 5.1+)
# Installed to %LOCALAPPDATA%\Infinitium\infinitium-profile.ps1
# Safe to edit - reinstall with Install.ps1 -Force to restore the original.

$global:InfinitiumEsc = [char]27
$global:InfinitiumPalette = @{
    Path   = "$($global:InfinitiumEsc)[38;2;110;231;249m"
    Git    = "$($global:InfinitiumEsc)[38;2;199;146;234m"
    Accent = "$($global:InfinitiumEsc)[38;2;91;231;169m"
    Dim    = "$($global:InfinitiumEsc)[38;2;90;103;133m"
    Reset  = "$($global:InfinitiumEsc)[0m"
}

function global:Get-InfinitiumGitBranch {
    param([string]$Path)
    try {
        $dir = New-Object System.IO.DirectoryInfo($Path)
        for ($i = 0; $i -lt 12 -and $null -ne $dir; $i++) {
            $dotGit = Join-Path $dir.FullName '.git'
            if (Test-Path -LiteralPath $dotGit) {
                $gitDir = $dotGit
                if (-not (Test-Path -LiteralPath $dotGit -PathType Container)) {
                    $first = Get-Content -LiteralPath $dotGit -TotalCount 1
                    if ($first -match '^gitdir:\s*(.+)$') {
                        $gitDir = $Matches[1].Trim()
                        if (-not [System.IO.Path]::IsPathRooted($gitDir)) {
                            $gitDir = Join-Path $dir.FullName $gitDir
                        }
                    }
                    else { return $null }
                }
                $head = Join-Path $gitDir 'HEAD'
                if (Test-Path -LiteralPath $head) {
                    $line = Get-Content -LiteralPath $head -TotalCount 1
                    if ($line -match '^ref:\s+refs/heads/(.+)$') { return $Matches[1] }
                    if ($line.Length -ge 7) { return $line.Substring(0, 7) }
                }
                return $null
            }
            $dir = $dir.Parent
        }
    }
    catch { }
    return $null
}

function global:prompt {
    $pal = $global:InfinitiumPalette
    $cwd = $PWD.Path
    $homePath = [Environment]::GetFolderPath('UserProfile')
    if ($cwd.Length -ge $homePath.Length -and $cwd.StartsWith($homePath, [StringComparison]::OrdinalIgnoreCase)) {
        $cwd = '~' + $cwd.Substring($homePath.Length)
    }
    if ($cwd.Length -gt 64) { $cwd = '...' + $cwd.Substring($cwd.Length - 61) }

    $branch = Get-InfinitiumGitBranch -Path $PWD.Path
    $out = $pal.Path + ' ' + $cwd
    if ($branch) { $out += '  ' + $pal.Git + 'git:' + $branch }
    $out += $pal.Reset + "`n" + $pal.Accent + '>' + $pal.Reset + ' '
    return $out
}

function global:ll { Get-ChildItem -Force @args }

function global:which {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Name)
    foreach ($n in $Name) {
        $c = Get-Command $n -ErrorAction SilentlyContinue
        if ($c) { $c.Source }
        else { Write-Host "not found: $n" -ForegroundColor DarkYellow }
    }
}

if (Get-Command git -ErrorAction SilentlyContinue) {
    if (-not (Get-Alias g -ErrorAction SilentlyContinue)) { Set-Alias -Name g -Value git -Scope Global }
    if (-not (Get-Alias gs -ErrorAction SilentlyContinue)) { Set-Alias -Name gs -Value git -Scope Global }
}

try {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = $utf8
    $global:OutputEncoding = $utf8
}
catch { }

try {
    Import-Module PSReadLine -ErrorAction Stop
    try { Set-PSReadLineOption -PredictionSource History } catch { }
    try { Set-PSReadLineOption -PredictionViewStyle ListView } catch { }
    try { Set-PSReadLineOption -EditMode Windows } catch { }
    try {
        Set-PSReadLineOption -Colors @{
            Command          = '#7DF3BC'
            Parameter        = '#9CC4FF'
            Operator         = '#C792EA'
            Variable         = '#F5D67B'
            String           = '#F5D67B'
            Number           = '#FFE9A3'
            Type             = '#6EE7F9'
            Comment          = '#5A6785'
            Keyword          = '#FF8FA3'
            Error            = '#FF6B81'
            Selection        = '#2A3A5C'
            InlinePrediction = '#5A6785'
        }
    }
    catch { }
    try { Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward } catch { }
    try { Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward } catch { }
    try { Set-PSReadLineKeyHandler -Key Ctrl+d -Function DeleteCharOrExit } catch { }
}
catch { }
