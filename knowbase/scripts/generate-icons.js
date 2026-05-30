#!/usr/bin/env node
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const svgPath = path.join(rootDir, 'renderer', 'assets', 'open-book-icon.svg');
const iconsDir = path.join(rootDir, 'assets', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create icons in different sizes for different platforms
const sizes = [
  { size: 16, name: 'icon-16.png' },
  { size: 32, name: 'icon-32.png' },
  { size: 64, name: 'icon-64.png' },
  { size: 128, name: 'icon-128.png' },
  { size: 256, name: 'icon-256.png' },
  { size: 512, name: 'icon-512.png' },
];

async function generateIcons() {
  try {
    const svg = fs.readFileSync(svgPath, 'utf-8');

    for (const { size, name } of sizes) {
      console.log(`Generating ${size}x${size}...`);
      await sharp(Buffer.from(svg))
        .resize(size, size)
        .png()
        .toFile(path.join(iconsDir, name));
    }

    console.log('✓ Icons generated successfully');
  } catch (err) {
    console.error('Error generating icons:', err.message);
    process.exit(1);
  }
}

generateIcons();
