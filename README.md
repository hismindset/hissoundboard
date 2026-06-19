# HISSOUNDBOARD

A modern, open-source soundboard application built with Electron, React, and TypeScript. Designed for gamers, streamers, and podcasters, it features dual audio output (monitor + voice chat), global hotkeys, dynamic pages, and a mobile remote control.

## ✨ Features

<details>
<summary><b>Click to expand the full feature list</b></summary>

### 🎛️ Soundboard & Pages
- **Numpad-style 3×3 grid**: "Just drag in and go" layout designed for muscle memory.
- **Dynamic pages**: Create, rename, delete, and organize sounds across unlimited pages.
- **Per-sound editing**: Adjust per-sound volume (up to 200%), trim start/end, set optional fade-in/-out (DaVinci-style corner handles on the waveform), and choose a playback mode (one-shot or loop).
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
- **Preview-play in the Library**: Audition sounds (small play button) in the library to pick the ones you want before placing them on the board.
- **Sync between devices**: Keep pages, sounds, and settings in sync across multiple machines (mechanism still open).
- **Myinstants link support**: Add sounds directly from a [Myinstants](https://www.myinstants.com/) link, not just `.mp3` files/URLs.
- **In-app help**: Built-in help/guide (microphone & virtual-audio setup, possibly surfacing README content) so users don't have to leave the app.
- **Multi-page view on wide windows**: Show several pages side by side when the window/monitor is wide.
- **Horizontal layout for Standard mode**: In Standard (non-numpad) mode, lay sounds out left-to-right (e.g. 1–7) instead of a 3×3 grid.
- **More audio sources**: Support additional audio output/input sources beyond the current routing.
- **Export & share settings (incl. sounds)**: Export a board to share with friends — per page or the whole setup.
- **Auto-updater**: Check for new releases and update in place (via `electron-updater`). Note: works for Windows (NSIS) and Linux (AppImage); macOS auto-update requires a signed/notarized build.
- **Localization** — add German (i18n), or keep the UI English-only for wider open-source reach?

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
- Since the app is not signed with an Apple Developer ID, macOS may say it is
  damaged or from an unidentified developer. Clear the quarantine flag once:
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

## 📱 Remote Control
1. Make sure your phone/tablet is on the **same network** as the PC.
2. Open **Settings** in the desktop app.
3. Scan the **QR code** or type the shown address (e.g. `http://192.168.x.x:8080`) into your phone's browser.
4. Tap sounds, switch pages, or hit **Stop All** — straight from your phone. The remote updates live as you edit the board.

## ⌨️ Shortcuts
- **Click**: Play sound
- **Right-click**: Edit sound (context menu)
- **Middle-click**: Remove sound from slot
- **Escape**: Stop all sounds (panic)
- Assign per-page trigger keys via the key icon on each page in the sidebar.

## 🔒 Privacy & Network

- **No telemetry.** HISSOUNDBOARD does not collect or send any usage data.
- **Local web server.** For the phone/tablet remote, the app runs a small HTTP +
  WebSocket server on **port `8080`**, bound to your local network only. It is
  used solely to serve the remote page and relay button presses — nothing leaves
  your LAN. Your OS/firewall may ask to allow incoming connections; that is
  expected (decline it if you don't use the remote). The QR code is generated
  **locally** (no third-party service). By default anyone on your LAN can use
  the remote; set an optional **Remote PIN** in Settings to require a code on
  untrusted networks.
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
