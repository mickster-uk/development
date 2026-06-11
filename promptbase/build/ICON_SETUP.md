# Promptbase Icon Setup Guide

This directory contains scripts and configuration for generating and managing icons for the Promptbase Electron app.

## Quick Setup

### Option 1: Using the Shell Script (Recommended for macOS)

1. **Save your avatar image** to your computer (e.g., `~/Downloads/avatar.png`)

2. **Run the generation script:**
   ```bash
   cd promptbase
   chmod +x build/generate-icons.sh
   ./build/generate-icons.sh ~/Downloads/avatar.png
   ```

3. **Verify the icons were created:**
   ```bash
   ls -la build/icons/
   ```

You should see:
- icon-16.png
- icon-32.png
- icon-64.png
- icon-128.png
- icon-256.png
- icon-512.png

### Option 2: Using Node Script (Requires sharp module)

1. **Install sharp:**
   ```bash
   npm install --save-dev sharp
   ```

2. **Run the Node script:**
   ```bash
   cd promptbase
   node build/generate-icons.js ~/Downloads/avatar.png
   ```

## Platform-Specific Icon Requirements

### macOS (.icns)
- **Required:** `build/icons/icon.icns`
- **Created from:** `build/icons/icon-512.png`
- **How to create:**
  1. Visit https://icoconvert.com/
  2. Upload `build/icons/icon-512.png`
  3. Download the `.icns` file
  4. Save as `build/icons/icon.icns`

### Windows (.ico)
- **Required:** `build/icons/icon.ico`
- **Created from:** `build/icons/icon-512.png`
- **How to create:**
  1. Visit https://convertio.co/png-ico/
  2. Upload `build/icons/icon-512.png`
  3. Download the `.ico` file
  4. Save as `build/icons/icon.ico`

### Linux (.png)
- **Required:** `build/icons/icon-512.png`
- **Automatically created** by the generation script

## File Structure After Setup

```
promptbase/
├── build/
│   ├── generate-icons.js
│   ├── generate-icons.sh
│   └── icons/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-64.png
│       ├── icon-128.png
│       ├── icon-256.png
│       ├── icon-512.png
│       ├── icon.icns (optional, for macOS)
│       └── icon.ico (optional, for Windows)
├── renderer/
│   └── index.html (references PNG icons)
├── main.js (uses icon for window)
└── package.json (build configuration)
```

## Building the App

After setting up icons, you can build the app:

### Development
```bash
npm run dev
```

### Production Build
```bash
npm install electron-builder --save-dev
npm run build  # (you may need to add this script to package.json)
```

Or manually with electron-builder:
```bash
npx electron-builder --publish never
```

## What Each Icon is Used For

| Icon | Use |
|------|-----|
| icon-16.png | Browser favicon |
| icon-32.png | Browser favicon, taskbar (Windows) |
| icon-64.png | Additional web support |
| icon-128.png | Web support, app stores |
| icon-256.png | Web support, app stores |
| icon-512.png | Linux AppImage, macOS source, web |
| icon.icns | macOS DMG installer, app bundle |
| icon.ico | Windows installer and EXE file |

## Troubleshooting

### Icons not showing in development
- Ensure PNG files exist in `build/icons/`
- Restart the Electron dev server (`npm run dev`)

### Build fails with missing icon.icns
- This is only needed for macOS builds
- For development/testing, you can skip platform-specific icons

### Build fails with missing icon.ico
- This is only needed for Windows builds
- For development/testing on other platforms, you can skip this

## Supported Image Formats

- **PNG** (.png) - Recommended, fully supported
- **JPEG** (.jpg) - Can be used as source
- **WebP** (.webp) - Can be used as source
- **SVG** (.svg) - Convert to PNG first

## Tips for Best Results

1. **Use square images** - 512x512 or larger preferred
2. **Include padding** - Leave ~10% padding around the main subject
3. **Simple design** - Avoid fine details that won't be visible at 16x16
4. **Test at small sizes** - Check how the icon looks at 16x16 and 32x32
5. **High contrast** - Ensure the icon is readable against both light and dark backgrounds
