// Run with: node build/generate-icons.js
// Requires sharp from the knowbase node_modules
const sharp = require('../../knowbase/node_modules/sharp');
const fs    = require('fs');
const path  = require('path');
const { execSync } = require('child_process');

const SRC  = path.join(__dirname, 'icon-source.png');
const OUT  = __dirname;
const ICONSET = path.join(OUT, 'icon.iconset');

// Square the portrait by centering on a transparent canvas
function makeSquare(size) {
  const dim = Math.max(896, 1195); // use longest side for canvas
  return sharp(SRC)
    .resize(Math.round(size * 896 / dim), Math.round(size * 1195 / dim), { fit: 'fill' })
    .extend({
      top:    Math.floor((size - Math.round(size * 1195 / dim)) / 2),
      bottom: Math.ceil((size  - Math.round(size * 1195 / dim)) / 2),
      left:   Math.floor((size - Math.round(size * 896  / dim)) / 2),
      right:  Math.ceil((size  - Math.round(size * 896  / dim)) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png();
}

async function run() {
  // ── macOS .icns ──────────────────────────────────────────────────────────
  fs.mkdirSync(ICONSET, { recursive: true });

  const macSizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const s of macSizes) {
    await makeSquare(s).toFile(path.join(ICONSET, `icon_${s > 512 ? 512 : s}x${s > 512 ? 512 : s}${s > 512 ? '@2x' : ''}.png`));
    if (s <= 512) {
      await makeSquare(s * 2).toFile(path.join(ICONSET, `icon_${s}x${s}@2x.png`));
    }
  }

  execSync(`iconutil --convert icns "${ICONSET}" --output "${path.join(OUT, 'icon.icns')}"`);
  fs.rmSync(ICONSET, { recursive: true });
  console.log('✓ icon.icns');

  // ── Linux .png (512×512) ─────────────────────────────────────────────────
  await makeSquare(512).toFile(path.join(OUT, 'icon.png'));
  console.log('✓ icon.png');

  // ── Windows .ico (multi-size) ────────────────────────────────────────────
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(icoSizes.map(s => makeSquare(s).toBuffer()));

  // Build ICO file manually (ICONDIR + ICONDIRENTRY headers + PNG data)
  const count = icoSizes.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const entries = pngBuffers.map((buf, i) => {
    const s = icoSizes[i];
    const entry = { size: s, buf, offset };
    offset += buf.length;
    return entry;
  });

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: ICO
  header.writeUInt16LE(count, 4);

  const dirEntries = entries.map(({ size, buf, offset }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);  // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1);  // height
    e.writeUInt8(0, 2);   // color count
    e.writeUInt8(0, 3);   // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bit count
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    return e;
  });

  const ico = Buffer.concat([header, ...dirEntries, ...entries.map(e => e.buf)]);
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico);
  console.log('✓ icon.ico');

  console.log('\nAll icons generated in Mik3Bot/build/');
}

run().catch(e => { console.error(e); process.exit(1); });
