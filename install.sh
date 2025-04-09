#!/bin/bash

# mediathekview CLI Installer

echo "Installing mediathekview CLI..."

# Ensure npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is required but not found. Please install Node.js and npm first."
    exit 1
fi

# Install dependencies
npm install

# Make scripts executable
chmod +x index.js
chmod +x help.js

# Link globally if possible
if [ -w "$(npm config get prefix)/bin" ]; then
    npm link
    echo "CLI tool installed globally. You can run it using 'mediathekview' command."
else
    echo "Note: To install globally, run 'sudo npm link' in this directory."
    echo "Otherwise, you can run the CLI using 'node index.js' or 'npm start'."
fi

echo ""
echo "Installation complete!"
echo "To get started, run: mediathekview -i"
echo "For help, run: npm run help"