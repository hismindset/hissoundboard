# OpenSoundBoard

A modern, open-source soundboard application built with Electron, React, and TypeScript. Designed for gamers, streamers, and podcasters, it features dual audio output (monitor + voice chat), global hotkeys, dynamic pages, and a mobile remote control.

## ✨ Features

<details>
<summary><b>Click to expand the full feature list</b></summary>

### 🎛️ Soundboard & Pages
- **Numpad-style 3×3 grid**: "Just drag in and go" layout designed for muscle memory.
- **Dynamic pages**: Create, rename, delete, and organize sounds across unlimited pages.
- **Per-sound editing**: Adjust per-sound volume (up to 200%), trim start/end, and choose a playback mode (one-shot or loop).
- **Stop All / Panic**: Instantly stop every playing sound (button or `Escape`).

### 🔊 Audio
- **Dual audio output**: Play each sound to your headphones (Monitor) *and* a virtual cable (Output) at the same time, with independent volume and mute per side.
- **Microphone injection (passthrough)**: Route your hardware mic into the Output cable so voice chat hears your voice + sounds through a single virtual microphone.
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
- **Download from URL** directly into your library.
- **Custom sounds directory** (or use the default app data folder).

### 🎨 Interface
- **Dark, gaming-inspired UI** with waveform previews (wavesurfer.js).

</details>

> Cross-platform desktop app built with **Electron + React + TypeScript** — runs on Windows, macOS, and Linux.

## 💡 Feature Ideas (Roadmap)

Not yet implemented — ideas under consideration:

- **Record your own sounds**: Capture audio directly from your microphone inside the app to create new soundboard clips.
- **Sync between devices**: Keep pages, sounds, and settings in sync across multiple machines (mechanism still open).
- **Myinstants link support**: Add sounds directly from a [Myinstants](https://www.myinstants.com/) link, not just `.mp3` files/URLs.
- **In-app help**: Built-in help/guide (microphone & virtual-audio setup, possibly surfacing README content) so users don't have to leave the app.
- **Middle-click to remove**: Quickly clear a sound from a slot via middle mouse button (currently not working).
- **Reorderable pages**: Drag to swap/rearrange page positions in the sidebar.
- **Multi-page view on wide windows**: Show several pages side by side when the window/monitor is wide.
- **Horizontal layout for Standard mode**: In Standard (non-numpad) mode, lay sounds out left-to-right (e.g. 1–7) instead of a 3×3 grid.
- **More audio sources**: Support additional audio output/input sources beyond the current routing.
- **Export & share settings (incl. sounds)**: Export a board to share with friends — per page or the whole setup.
- **Auto-updater**: Check for new releases and update in place (via `electron-updater`). Note: works for Windows (NSIS) and Linux (AppImage); macOS auto-update requires a signed/notarized build.
- **Optional fade in/out**: Smooth fade-in on start and fade-out on stop/end, configurable per sound.
- **Improve relocation hints**: Flesh out the legacy "this moved elsewhere" notices (e.g. "Page modifiers are now managed in the Page Sidebar").

## 📋 TODO

Concrete tasks (committed, not just ideas):

- **Adapt design & branding to hismindset.**
- **Automated dependency updates**: Set up Renovate (or Dependabot) for regular, low-noise updates.
- **Straighten out release & deployment**: Reliable, repeatable release flow including versioning (e.g. tag → CI builds → GitHub Release).

## 🐞 Known Issues

- **Trimmed sound occasionally starts from the beginning** after the app has been idle for a while — likely the trim seek (`currentTime = trimStart`) being applied before the audio metadata is loaded, so it is lost on a cold cache. Fix: apply the seek on `loadedmetadata`.

## ❓ Open Questions

Decisions still to make:

- **Tests** — worthwhile? If yes, which kind and scope? (See README maintainer notes / discuss.)
- **Localization** — add German (i18n), or keep the UI English-only for wider open-source reach?

---

## 🚀 Installation & Setup

### 1. Prerequisites (Virtual Audio)
To play sounds into voice chats (Discord, Teams, Zoom), you need a **Virtual Audio Device**. OpenSoundBoard acts as a source, playing audio into this "virtual microphone".

| OS | Recommended Software | Link |
| :--- | :--- | :--- |
| **Windows** | VB-Cable (Free) | [Download](https://vb-audio.com/Cable/) |
| **macOS** | BlackHole (Free) | [Download](https://github.com/ExistentialAudio/BlackHole) |
| **Linux** | PulseAudio Null Sink | *Built-in (App provides auto-setup)* |

**After installing:**
1. Open **OpenSoundBoard Settings** (or use the Setup Wizard).
2. Set **Output Device** to *CABLE Input* (Windows) or *BlackHole* (macOS).
3. In your Voice Chat App (e.g., Discord), set **Input Device** to *CABLE Output* or *BlackHole*.

### 2. Install the App

#### Windows
- **Installer:** Download `OpenSoundBoard-Setup.exe` and run it.
- **Portable:** Download the `.zip`, extract, and run `OpenSoundBoard.exe`.

#### macOS
- **Installer:** Download the `.dmg`, open it, and drag `OpenSoundBoard` to Applications.
- **Portable:** Download the `.zip`, extract, and run.

> **Note:** Since this app is not signed with an Apple Developer ID, you may need to run this command if it says "App is damaged":
> ```bash
> xattr -cr /Applications/OpenSoundBoard.app
> ```

#### Linux
- **Debian/Ubuntu:** Download `.deb` and run `sudo dpkg -i OpenSoundBoard*.deb`.
- **Fedora/RHEL:** Download `.rpm` and install.
- **AppImage:** Download `.AppImage`, make it executable (`chmod +x`), and run.

---

## 🎙️ Microphone Injection (Passthrough)
1.  Open **Settings** and find the "Microphone Injection" section.
2.  Select your hardware microphone (e.g., Focusrite, Internal Mic).
3.  The app will route your voice directly to the **Output Device** (Cable).
4.  **Note:** You will *not* hear yourself (to prevent feedback), but others in the voice chat will hear you + the soundboard sounds.

## 📱 Remote Control
1. Open **Settings** in the desktop app.
2. Scan the **QR Code** or enter the IP address on your phone's browser.
3. You can now tap sounds and switch pages from your mobile device!

## ⌨️ Shortcuts
- **Click**: Play Sound
- **Right-Click**: Edit Sound / Assign Key
- **Stop All**: Stop all currently playing sounds.

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
