# OpenSoundBoard

A modern, dark-themed soundboard application built with Electron, React, and TypeScript. Features dual audio output (monitor + voice chat), global shortcuts, and remote control via mobile web interface.

## Installation & Running

### Windows
- **Installer:** Download `OpenSoundBoard-Setup.exe`. Run it to install.
- **Portable:** Download the `.zip` file, extract it, and run `OpenSoundBoard.exe`.

### macOS
- **Installer:** Download the `.dmg` file. Open it and drag `OpenSoundBoard` to the Applications folder.
- **Portable:** Download the `.zip` file, extract, and run.

> **Note:** Since this app is not signed with an Apple Developer ID, macOS will quarantine it and show an "App is damaged" error. To run it:

1. Install the app to your `/Applications` folder (via DMG drag-and-drop or by moving the extracted app).
2. Open Terminal and run:
   ```bash
   xattr -cr /Applications/OpenSoundBoard.app
   ```
   *(Or use the included `./fix_mac_app.sh` script)*
3. Run the app normally.


### Linux
- **Debian/Ubuntu:** Download the `.deb` file and install with `sudo dpkg -i OpenSoundBoard*.deb`.
- **Fedora/RHEL:** Download the `.rpm` file and install.
- **Portable:** Download the `.zip`, extract, and run the executable.

## Features
- **Dual Audio Output**: Route sounds to your headphones and a virtual cable (for Discord/Teamspeak) simultaneously with independent volume controls.
- **Global Shortcuts**: Trigger sounds even when the app is minimized.
- **Remote Control**: Control the board from any device on your local network/Wi-Fi.
- **Custom Sounds Directory**: Store your sound library anywhere.
- **Drag & Drop**: Add sounds easily to the library and grid.
