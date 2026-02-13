#!/bin/bash

# Simple script to fix "App is damaged" error on macOS for OpenSoundBoard
# Usage: ./fix_mac_app.sh /path/to/OpenSoundBoard.app

APP_PATH="${1:-/Applications/OpenSoundBoard.app}"

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found at $APP_PATH"
    echo "Usage: ./fix_mac_app.sh /path/to/OpenSoundBoard.app"
    exit 1
fi

echo "Fixing permissions for $APP_PATH..."
xattr -cr "$APP_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Success! You can now open OpenSoundBoard."
else
    echo "❌ Failed to clear attributes. Try running with sudo:"
    echo "sudo xattr -cr \"$APP_PATH\""
fi
