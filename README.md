# OpenSoundBoard

A modern, open-source soundboard application built with Electron, React, and TypeScript. Designed for gamers, streamers, and podcasters, it features dual audio output (monitor + voice chat), global hotkeys, dynamic pages, and a mobile remote control.

## ✨ Features

- **Dynamic Pages**: Create, rename, delete, and organize your sounds across unlimited pages.
- **Dual Audio Output**: Route sounds to your headphones (Monitor) and a virtual cable (Output) simultaneously with independent volume controls.
- **Global Hotkeys**: Trigger sounds from anywhere, even when the app is minimized. Supports modifiers (Ctrl, Alt, Shift).
- **Remote Control**: Control your soundboard from any phone or tablet on your local network. Now supports page navigation!
- **Audio Setup Wizard**: Built-in guide to help you configure virtual audio devices on Windows, macOS, and Linux.
- **Smart Drag & Drop**: Easily add sounds to your library and arrange them on the grid.
- **Dark Mode UI**: Sleek, gaming-inspired interface.

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
