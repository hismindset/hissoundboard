# HISSOUNDBOARD

A modern, open-source soundboard application built with Electron, React, and TypeScript. Designed for gamers, streamers, and podcasters, it features dual audio output (monitor + voice chat), global hotkeys, dynamic pages, and a mobile remote control.

## ✨ Features

<details>
<summary><b>Click to expand the full feature list</b></summary>

### 🎛️ Soundboard & Pages
- **Numpad-style 3×3 grid**: "Just drag in and go" layout designed for muscle memory.
- **Dynamic pages**: Create, rename, delete, and organize sounds across unlimited pages.
- **Multi-page view on wide windows**: On screens ≥ 1280 px the active page is shown next to the following page; on ≥ 1800 px (e.g. WQHD) up to three pages are shown side by side, each with its own title bar and per-page modifier button. Clicks on any visible cell play their sound directly; global hotkeys keep working on every page.
- **Per-sound editing**: Adjust per-sound volume (up to 200%), trim start/end, set optional fade-in/-out (DaVinci-style corner handles on the waveform), and choose a playback mode (one-shot or loop).
- **Stop All / Panic**: Instantly stop every playing sound (button or `Escape`).

### 🔊 Audio
- **Dual audio output**: Play each sound to your headphones (Monitor) *and* a virtual cable (Output) at the same time, with independent volume and mute per side.
- **Microphone injection (passthrough)**: Route your hardware mic into the Output cable so voice chat hears your voice + sounds through a single virtual microphone.
- **Voice changer**: Six built-in mic effects — Robot, Deep, High, Cathedral (reverb), Chorus, and Megaphone. Toggle them from the Library panel or drop them onto grid slots to switch effects via global hotkeys. Each effect's parameters are editable in-app (live, persisted, with reset), including a self-monitor mode to hear yourself while tweaking.
- **Audio Setup Wizard**: Cross-platform guide that detects virtual audio devices and, on Linux, can auto-create a PulseAudio null sink.
- **48 kHz audio engine**: Fixed sample rate for consistent routing across devices.

### ⌨️ Shortcuts (Global)
- **Global hotkeys**: Trigger sounds even when the app is minimized.
- **Numpad or Standard (1–9) modes**.
- **Per-page modifiers**: Combine with Ctrl / Alt / Shift to address different pages.
- **Key recorder**: Click-to-assign modifier combinations.
- **Wayland fallback**: Automatically switches to Electron's global shortcuts on Wayland (with a heads-up notice).

### 📱 Remote Control
- **Phone/tablet remote**: Built-in web server (port 8080) + WebSocket; control sounds from any device on your LAN.
- **QR code pairing** and **page navigation** from the remote.

### 📂 Library & Files
- **Smart drag & drop** to add sounds and arrange the grid.
- **Preview-play**: Audition any library sound before placing it on the board.
- **Download from URL** directly into your library, including [Myinstants](https://www.myinstants.com/) sound-page links.
- **Sync Folder**: Choose a folder to keep boards, sounds, remote settings, and app configuration synchronized between devices.

### 🎨 Interface
- **Dark, gaming-inspired UI** with waveform previews (wavesurfer.js).
- **In-app help**: A practical setup guide plus a deliberately fake Easter-egg help screen.

### 🔄 Updates
- **In-app auto-update** (packaged builds only): On startup, the app checks GitHub Releases for a newer version.
- **Update dialog**: Shows the new version, the release's Summary section, and — for major version jumps — a highlighted breaking-changes warning.
- **Install options**: **Install now** (Windows/Linux: downloads with progress and restarts automatically; macOS: **Download update** button opens the GitHub release instead, since unsigned builds cannot self-update), **Later** (prompts again at a later start, earliest 24 hours later), or **Skip this version** (won't ask again for that exact version; the next newer release prompts again).
- **Settings panel**: Shows your current version and has a manual **Check for updates** button; manual checks ignore Later/Skip state.
- **User data unchanged**: Your boards, sounds, and settings are never affected by updates.

</details>

> Cross-platform desktop app built with **Electron + React + TypeScript** — runs on Windows, macOS, and Linux.

## 💡 Feature Ideas (Roadmap)

Not yet implemented — ideas under consideration:

- **Record your own sounds**: Capture audio directly from your microphone inside the app to create new soundboard clips.
- **Multi-page view on wide windows**: Show several pages side by side when the window/monitor is wide.
- **Better global-shortcut support on Wayland** ([#31](https://github.com/hismindset/hissoundboard/issues/31)): ship compositor-specific setup steps (GNOME, Sway, Hyprland) next to the existing KDE helper, and look at the Wayland GlobalShortcuts portal for a sandboxed in-app registration.
- **Global "disable all shortcuts" kill switch** ([#32](https://github.com/hismindset/hissoundboard/issues/32)): a one-click suspend for uiohook / Electron globalShortcut registration, useful when handing the keyboard to a guest or sharing the screen.
- **Per-page hotkey disable** ([#33](https://github.com/hismindset/hissoundboard/issues/33)): a per-page `shortcutsEnabled` flag so a single test / scratch page can't fire on stray numpad presses.
- **"Require a modifier" mode** ([#34](https://github.com/hismindset/hissoundboard/issues/34)): make it the default that pages without a modifier trigger are ignored by numpad presses, with a per-page opt-out for users who rely on the current behaviour.
- **Autotune voice effect** ([#36](https://github.com/hismindset/hissoundboard/issues/36)): a 7th effect in the voice changer with editable scale, key, and retune speed.
- **Horizontal layout for Standard mode**: In Standard (non-numpad) mode, lay sounds out left-to-right (e.g. 1–7) instead of a 3×3 grid.
- **More audio sources**: Support additional audio output/input sources beyond the current routing.
- **Export & share settings (incl. sounds)**: Export a board to share with friends — per page or the whole setup.
- **Localization** — add German (i18n), or keep the UI English-only for wider open-source reach?

### 🐛 Known bugs under investigation

- **Trim settings ignored for some sounds** ([#35](https://github.com/hismindset/hissoundboard/issues/35)): a sound that has non-zero `trimStart` / `trimEnd` plays back in full length on click or via shortcut. Needs a reliable repro to confirm the root cause (suspected Howl `seek()` race or a config-migration edge case).

---

## 🚀 Installation & Setup

### 1. Prerequisites (Virtual Audio)
To play sounds into voice chats (Discord, Teams, Zoom), you need a **Virtual Audio Device**. HISSOUNDBOARD acts as a source, playing audio into this "virtual microphone".

| OS | Recommended Software | Link |
| :--- | :--- | :--- |
| **Windows** | VB-Cable (Free) | [Download](https://vb-audio.com/Cable/) |
| **macOS** | BlackHole (Free) | [Download](https://github.com/ExistentialAudio/BlackHole) |
| **Linux** | PulseAudio Null Sink | *Built-in (App provides auto-setup)* |

**After installing:**
1. Open **HISSOUNDBOARD Settings** (or use the Setup Wizard).
2. Set **Output Device** to *CABLE Input* (Windows) or *BlackHole* (macOS).
3. In your Voice Chat App (e.g., Discord), set **Input Device** to *CABLE Output* or *BlackHole*.

### 2. Install the App

> **Note:** The builds are **not code-signed**. That's expected for an
> open-source project, but your OS may warn you on first launch (see the
> per-platform notes below). The app contains no telemetry and bundles no
> third-party binaries.

#### Windows
- **Installer:** Download `HISSOUNDBOARD Setup <version>.exe` (NSIS) and run it.
- On first run, Windows SmartScreen may warn about an unknown publisher →
  **More info → Run anyway**.

#### macOS
- Download the `.dmg`, open it, and drag `HISSOUNDBOARD` to Applications.
- The build is **ad-hoc signed**, so it runs out of the box. If Gatekeeper
  still objects (e.g. you moved the file between volumes or used an older
  pre-release build), clear the quarantine flag once:
  ```bash
  xattr -cr "/Applications/HISSOUNDBOARD.app"
  ```

#### Linux
- **AppImage:** Download the `.AppImage`, make it executable
  (`chmod +x HISSOUNDBOARD*.AppImage`), and run it.

---

## 🎙️ Microphone Injection (Passthrough)
1.  Open **Settings** and find the "Microphone Injection" section.
2.  Select your hardware microphone (e.g., Focusrite, Internal Mic).
3.  The app will route your voice directly to the **Output Device** (Cable).
4.  **Note:** You will *not* hear yourself (to prevent feedback), but others in the voice chat will hear you + the soundboard sounds.

## 🎭 Voice Changer
Apply fun effects to your voice on top of the mic passthrough:

1. Enable **Microphone Injection** (see above) — effects are applied to the mic signal before it reaches the Output cable.
2. Open the **Library** panel: the "Voice Effects" section lists all presets (**Robot, Deep, High, Cathedral, Chorus, Megaphone**). Click one to toggle it.
3. **Hotkeys:** Drag an effect onto any grid slot — triggering that slot (click, numpad hotkey, or remote) then toggles the effect instead of playing a sound.
4. Only **one effect is active at a time**; activating another one replaces it, activating the same one again switches back to your clean voice.
5. **Customize effects:** every effect has editable parameters (e.g. pitch amount, modulation frequency, reverb length, distortion). Open the editor via the pencil icon on an effect in the Library, or right-click an effect slot on the grid → "Edit Effect". Changes apply **live** while the effect is running, are saved persistently, and can be reverted with the Reset button. The editor also offers a **Monitor** mode that plays your processed voice on the monitor device — use headphones to avoid feedback.

Notes:
- Effects always start **disabled** on app launch, and **Escape (panic)** also resets your voice to clean.
- You won't hear the effect yourself (same as the mic passthrough — no feedback), but voice chat will.
- **Linux:** normally the mic is mixed at the OS level (zero extra latency). While a voice effect is active, the app temporarily unloads the OS loopback and routes the mic through its own audio engine instead (slightly higher latency); turning the effect off restores the OS loopback automatically.

## 📱 Remote Control
1. Make sure your phone/tablet is on the **same network** as the PC.
2. Open **Settings**, enable the local web server, and set the required PIN (or use its four-digit generator).
3. Scan the **QR code** or type the shown address (e.g. `http://192.168.x.x:8080`) into your phone's browser, then enter the PIN.
4. Tap sounds, switch pages, or hit **Stop All** — straight from your phone. The remote updates live as you edit the board.

## ⌨️ Shortcuts
- **Click**: Play sound
- **Right-click**: Edit sound (context menu)
- **Middle-click**: Remove sound from slot
- **Escape**: Stop all sounds (panic)
- Assign per-page trigger keys via the key icon on each page in the sidebar (or directly on the page header when multiple pages are shown side by side).

## 🔒 Privacy & Network

- **No telemetry.** HISSOUNDBOARD does not collect or send any usage data.
- **Local web server.** The phone/tablet remote uses a small HTTP + WebSocket
  server on **port `8080`**, bound to your local network only. It is **off by
  default** and can be started in Settings when needed. Starting it always
  requires a PIN of at least four characters; the PIN is saved in your synced
  configuration and cannot be removed later. You may also enable automatic
  startup in Settings. The QR code is generated **locally** (no third-party
  service); nothing leaves your LAN.
- **Your sounds stay local.** Audio files live in your app data folder (or a
  custom directory you choose) and are never uploaded.

## 📄 License

Released under the **MIT License** — see [LICENSE](LICENSE).
Bundled open-source components and their licenses are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## 🛠️ Development

### Setup
```bash
npm install
```

### Run Locally
```bash
npm start
```

### Build
```bash
npm run build
```
Build artifacts will be in the `dist` folder.

### Release

Release and dependency-update automation is documented in
[docs/release-process.md](docs/release-process.md).
