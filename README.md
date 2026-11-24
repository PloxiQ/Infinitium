# Infinitium Shell

A themed terminal workspace for Windows. Infinitium ships in two forms:

- **Infinitium Shell Desktop** — a native desktop app with real terminal sessions,
  tabs, a dashboard, live system statistics, settings and a command palette.
- **Infinitium Shell for Windows Terminal** — a profile, color scheme, prompt and
  optional portable Windows Terminal copy for the terminal you already use.

Both are designed around **Windows PowerShell 5.1**, the version included with
Windows. PowerShell 7 (`pwsh`) is not required.

---

## Infinitium Shell Desktop

The desktop app is an Electron shell around a real ConPTY session. The terminal is
powered by `@lydell/node-pty` and xterm.js, so commands, colours, resizing, SSH,
Unicode and interactive programs behave like a native terminal — not a fake
command box.

### Features

| | |
|---|---|
| **Real terminal** | ConPTY-backed PowerShell 5.1, Command Prompt or Git Bash sessions |
| **Tabs** | Multiple independent shells, keyboard cycling, middle-click close |
| **Dashboard** | Clock, quick actions, CPU / memory / disk / uptime, session activity |
| **Statistics** | 60-second live CPU + memory chart, 7-day activity chart, lifetime totals |
| **Command palette** | Searchable commands for tabs, views, folders, VS Code and settings |
| **Settings** | Accent, font size, cursor style, default shell, start view, reduced motion |
| **Window** | Frameless custom titlebar, maximize/restore, remembered bounds |
| **Persistence** | Settings, window position and statistics survive restarts |

### Requirements

- Windows 10 1809+ or Windows 11, x64.
- PowerShell 5.1 — already installed on Windows.
- Git Bash and Visual Studio Code are optional; Infinitium detects them.
- **For development only:** Node.js **22.12+** and npm.

The packaged app does not require Node.js on the target machine.

### Run from source

```powershell
cd F:\Github\Infinitium\desktop
npm install
npm start
```

`npm install` downloads Electron and the native PTY binary. Use an x64 Node.js
installation; if the native module fails to load, reinstall with Node.js 22 LTS
x64 and run `npm rebuild`.

### Build a portable app

```powershell
cd F:\Github\Infinitium\desktop
npm run dist
```

The result is a self-contained folder:

```text
desktop\dist\Infinitium Shell-win32-x64\Infinitium Shell.exe
```

Copy that folder anywhere and run the executable. There is no installer and no
code-signing certificate yet, so Windows SmartScreen may show a warning the first
time it runs.

### Start Menu shortcut

After building, create a shortcut with PowerShell:

```powershell
$exe = "F:\Github\Infinitium\desktop\dist\Infinitium Shell-win32-x64\Infinitium Shell.exe"
$lnk = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Infinitium Shell.lnk"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = $exe
$sc.WorkingDirectory = Split-Path $exe
$sc.IconLocation = "$exe,0"
$sc.Description = "Infinitium Shell"
$sc.Save()
```

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+P` | Open / close the command palette |
| `Ctrl+Shift+T` | New terminal tab |
| `Ctrl+Shift+W` | Close the active tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab |
| `Alt+1` … `Alt+4` | Terminal, Dashboard, Statistics, Settings |
| `Ctrl+=` / `Ctrl+-` | Increase / decrease terminal font size |
| `Ctrl+0` | Reset font size to 13 |
| `Ctrl+Shift+C` | Copy the terminal selection |
| `Ctrl+Shift+V` | Paste into the terminal |
| `Ctrl+Shift+A` | Select all terminal output |
| `Esc` | Close the palette |

### Data and reset

The app stores its state per Windows user:

| Path | Contents |
|---|---|
| `%APPDATA%\Infinitium Shell\settings.json` | Accent, font, shell, window bounds |
| `%APPDATA%\Infinitium Shell\stats.json` | Launches, command count, daily activity |
| `%LOCALAPPDATA%\Infinitium\infinitium-profile.ps1` | Shared PowerShell prompt profile |

The **Settings** view has buttons to open the data folder, reset statistics and
reset all settings. The prompt profile is shared with the Windows Terminal
package, so the same prompt appears in both.

### Customize the desktop app

The renderer is plain HTML, CSS and JavaScript — no framework or bundler. Edit a
file and restart `npm start`.

- **Colors and spacing** — `desktop\renderer\css\base.css` contains the design
  tokens and the four accent palettes (`cyan`, `purple`, `green`, `amber`).
- **Layout** — `desktop\renderer\css\shell.css` (titlebar, rail, tabs, palette)
  and `desktop\renderer\css\views.css` (dashboard, stats, settings).
- **Terminal colors** — `desktop\renderer\js\terminal.js` maps the accent name to
  an xterm theme. Keep its accent names in sync with `base.css`.
- **Defaults** — `desktop\lib\settings.js`.
- **Icons** — `desktop\assets\infinitium.png` and `infinitium.ico`.
- **Commands** — add palette entries in `desktop\renderer\js\app.js`.

### How the desktop app works

```text
main process (Electron)
  ├─ window, single-instance lock, bounds persistence
  ├─ settings.json + stats.json
  ├─ system snapshot loop (CPU, memory, disk, uptime)
  └─ PTY manager ── @lydell/node-pty ── PowerShell / cmd / Git Bash
          │ IPC
preload.js (contextBridge)
          │
renderer (sandboxed page)
  ├─ xterm.js tabs
  ├─ dashboard / statistics / settings views
  └─ command palette
```

The renderer runs with `contextIsolation: true` and `nodeIntegration: false`.
External links are limited to `http(s)` and open in the default browser.

### Smoke test (contributors)

The app includes a small screenshot harness used during development:

```powershell
cd F:\Github\Infinitium\desktop
$env:INFINITIUM_SMOKE = '1'
$env:INFINITIUM_SMOKE_DIR = "$PWD\smoke"
npm start
```

It opens the app, types into the PTY, visits each view and writes PNGs to
`smoke\`, then exits. Do not commit `smoke\`, `node_modules\` or `dist\`.

---

## Infinitium Shell for Windows Terminal

This package layers the Infinitium identity on top of the real Windows Terminal
engine. You keep tabs, panes, mouse reporting, Unicode and SSH, and Windows
updates keep working.

### What you get

| | |
|---|---|
| **Profile** | “Infinitium Shell” in the Terminal dropdown, acrylic background, hidden scrollbar, 20 000 line history, bar cursor |
| **Color scheme** | “Infinitium Dark” — midnight blue with cyan/purple accents |
| **Prompt** | Two lines: path + git branch, then `>`; PSReadLine predictions and matching syntax colors |
| **Window theme** | Optional Mica tab row and custom tab colors (`-ApplyTheme`) |
| **Icon + shortcut** | Multi-size icon and a Start Menu shortcut named “Infinitium Shell” |
| **Font** | Optional per-user install of JetBrainsMono Nerd Font Mono (`-InstallFont`) |

### Requirements

- Windows 11 recommended (Windows 10 1809+ also works; Mica needs Windows 11 22H2+)
- Windows Terminal 1.5 or newer (1.24+ for the custom profile icon)
- PowerShell 5.1 — already on every Windows install

### Install

```powershell
cd F:\Github\Infinitium
.\Install.ps1 -InstallFont -ApplyTheme
```

Then launch **Infinitium Shell** from the Start Menu, or run `.\Launch.cmd`.

| Flag | Effect |
|---|---|
| *(none)* | Adds the profile + color scheme + shortcut to your existing Terminal |
| `-InstallFont` | Downloads and installs JetBrainsMono Nerd Font Mono for the current user |
| `-ApplyTheme` | Adds the Mica window theme to Terminal's `settings.json` (backed up first) |
| `-Portable` | Downloads Windows Terminal and builds a self-contained copy in `app\` |
| `-DesktopShortcut` | Also puts a shortcut on the desktop |
| `-BackgroundImage <path>` | Uses an image behind the terminal at 22% opacity |
| `-Force` | Overwrites an existing portable copy or prompt script |

If PowerShell blocks the script:

```powershell
powershell -ExecutionPolicy Bypass -File .\Install.ps1 -InstallFont -ApplyTheme
```

### Two modes

**Profile mode (default)** modifies the Windows Terminal you already have.
Terminal keeps updating, stays your default terminal, and the profile appears next
to PowerShell and Command Prompt. This is the right choice for daily use.

**Portable mode (`-Portable`)** creates the same profile inside a private copy of
Windows Terminal in `app\`, with its own `settings\settings.json` and a `.portable`
marker file. Nothing outside the folder is touched, so you can move it to another
PC. Trade-offs, straight from Microsoft: a portable copy cannot be set as the
default terminal, does not auto-update, and has no “Open in Terminal” context menu.

### Reversibility and safety

- The profile and color scheme are installed as a Windows Terminal **fragment** in
  `%LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\Infinitium\`. Your main
  `settings.json` is not edited by profile mode.
- `-ApplyTheme` is the only step that edits Terminal's `settings.json`. It first
  writes a timestamped backup next to the file, then inserts a clearly marked
  `// >>> Infinitium Shell theme` block.
- `Uninstall.ps1` removes the fragment, shortcuts, prompt files and the managed
  theme block. Other Terminal settings are left alone.

### Uninstall

```powershell
.\Uninstall.ps1              # profile, shortcut, prompt, theme block
.\Uninstall.ps1 -Purge       # also delete app\
.\Uninstall.ps1 -RemoveFont  # also remove the Nerd Font
```

### Customize the Windows Terminal package

- **Colors** — `config\fragment.json` (profile mode) and
  `config\portable-settings.json` (portable mode). Keep both in sync.
- **Window chrome** — `config\theme.json` (theme name, Mica, tab row, close button).
- **Prompt** — `profile\infinitium-profile.ps1`. Reinstall with `-Force` to copy it
  to `%LOCALAPPDATA%\Infinitium`, or edit the installed copy directly.
- **Name** — replace `Infinitium` / `Infinitium Shell` in `tools\Common.ps1`,
  `config\*.json`, `profile\infinitium-profile.ps1` and the asset filenames.
- **Icon** — replace `assets\infinitium.png` and `.ico`, or run
  `tools\New-InfinitiumIcon.ps1` to regenerate the current mark.

### Troubleshooting

**The profile is not in the dropdown.** Close every Terminal window and open a new
one — fragments are read at startup. Then check that
`%LOCALAPPDATA%\Microsoft\Windows Terminal\Fragments\Infinitium\infinitium.json`
exists.

**The font looks wrong.** Confirm the face name is exactly
`JetBrainsMono Nerd Font Mono` in Terminal's settings, and sign out/in if the font
was only just installed.

**`-ApplyTheme` printed a warning.** Your `settings.json` already defines `theme`
or `themes`, so the installer refused to overwrite it. Remove that entry and
re-run, or use `-Portable`.

**Portable mode does not open in my home folder.** Portable Terminal does not
support `ms-appdata://` paths; this package uses absolute paths instead, so keep
`%LOCALAPPDATA%\Infinitium` in place or re-run the installer after moving the app.

---

## Repository layout

```text
Infinitium/
├─ assets/                 Windows Terminal icons
├─ config/                 Terminal fragment, portable settings, theme
├─ profile/                PowerShell prompt script
├─ tools/                  Shared installer helpers
├─ Install.ps1             Windows Terminal package installer
├─ Uninstall.ps1           Reversible uninstaller
├─ Launch.cmd              Launcher generated by the installer
└─ desktop/                Infinitium Shell Desktop
   ├─ main.js              Electron main process
   ├─ preload.js           contextBridge API
   ├─ lib/                 settings, stats, PTY manager
   ├─ renderer/            HTML, CSS, JS and xterm vendor files
   ├─ assets/              Desktop app icon
   ├─ package.json         start / dist scripts
   └─ dist/                Packaged app output (ignored by git)
```

## License

MIT — see [LICENSE](LICENSE).
