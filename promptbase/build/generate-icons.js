#!/usr/bin/env node
/**
 * Icon generation script for Promptbase
 * Usage: node build/generate-icons.js <source-image-path>
 * 
 * This script generates all necessary icon sizes for Electron builds:
 * - 16x16 (favicon)
 * - 32x32 (favicon)
 * - 64x64
 * - 128x128
 * - 256x256
 * - 512x512 (app icon, Linux)
 * 
 * For macOS (.icns) and Windows (.ico), use tools like:
 * - macOS: tiffutil or online converters
 * - Windows: ImageMagick convert or online converters
 */

const fs = require('fs');
const path = require('path');

// Try to use sharp if available, otherwise guide user
let sharp = null;
try {
  sharp = require('sharp');
} catch (err) {
  console.log('Note: "sharp" npm package not found.');
  console.log('For automated icon generation, install it with: npm install --save-dev sharp');
  console.log('\nAlternatively, you can manually convert the image using:');
  console.log('  macOS: sips -z <width> <height> <input> -o <output>');
  console.log('  All platforms: imagemagick convert or online tools');
  process.exit(1);
}

const sourceImage = process.argv[2];
if (!sourceImage) {
  console.error('Usage: node build/generate-icons.js <source-image-path>');
  console.error('Example: node build/generate-icons.js ~/Downloads/avatar.png');
  process.exit(1);
}

if (!fs.existsSync(sourceImage)) {
  console.error(`Error: File not found: ${sourceImage}`);
  process.exit(1);
}

const outputDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const sizes = [
  { size: 16, name: 'icon-16.png' },
  { size: 32, name: 'icon-32.png' },
  { size: 64, name: 'icon-64.png' },
  { size: 128, name: 'icon-128.png' },
  { size: 256, name: 'icon-256.png' },
  { size: 512, name: 'icon-512.png' }
];

async function generateIcons() {
  try {
    console.log(`Reading source image: ${sourceImage}`);
    
    for (const { size, name } of sizes) {
      const outputPath = path.join(outputDir, name);
      console.log(`Generating ${size}x${size}: ${name}`);
      
      await sharp(sourceImage)
        .resize(size, size, {
          fit: 'cover',
          position: 'center'
        })
        .png()
        .toFile(outputPath);
      
      console.log(`  ✓ Created ${name}`);
    }
    
    console.log('\n✓ All PNG icons generated successfully!');
    console.log(`\nIcons saved to: ${outputDir}/`);
    console.log('\nNext steps for other platforms:');
    console.log('  1. macOS (.icns): Convert icon-512.png using');
    console.log('     - online tool: https://icoconvert.com/');
    console.log('     - or use: tiffutil -cathidpicheck icon-512.png -out icon.icns');
    console.log('  2. Windows (.ico): Convert icon-512.png using');
    console.log('     - online tool: https://convertio.co/png-ico/');
    console.log('     - or install ImageMagick: convert icon-512.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico');
    console.log('  3. Save both icon.icns and icon.ico to build/icons/');
    
  } catch (err) {
    console.error('Error generating icons:', err);
    process.exit(1);
  }
}

generateIcons();
