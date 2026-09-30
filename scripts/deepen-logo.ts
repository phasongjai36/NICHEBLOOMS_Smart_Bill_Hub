// Recolor the clean gold logo into a deep-gold print variant — no image libs.
// PNG decode (RGBA8, filters 0-4) -> tone map -> encode (filter 0 + zlib).
import fs from 'fs';
import zlib from 'zlib';

function decodePng(buf: Buffer) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`bitDepth ${bitDepth} unsupported`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0;
  if (!channels) throw new Error(`colorType ${colorType} unsupported`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[rp++];
      const left = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      let v = cur;
      if (filter === 1) v = cur + left;
      else if (filter === 2) v = cur + up;
      else if (filter === 3) v = cur + ((left + up) >> 1);
      else if (filter === 4) v = cur + paeth(left, up, ul);
      out[y * stride + x] = v & 0xff;
    }
  }
  // expand to RGBA
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4, s = i * bpp;
    if (colorType === 6) { rgba[o] = out[s]; rgba[o+1] = out[s+1]; rgba[o+2] = out[s+2]; rgba[o+3] = out[s+3]; }
    else if (colorType === 2) { rgba[o] = out[s]; rgba[o+1] = out[s+1]; rgba[o+2] = out[s+2]; rgba[o+3] = 255; }
    else if (colorType === 3) {
      const idx = out[s];
      rgba[o] = palette![idx*3]; rgba[o+1] = palette![idx*3+1]; rgba[o+2] = palette![idx*3+2];
      rgba[o+3] = trns && idx < trns.length ? trns[idx] : 255;
    }
    else if (colorType === 0) { rgba[o]=rgba[o+1]=rgba[o+2]=out[s]; rgba[o+3]=255; }
    else if (colorType === 4) { rgba[o]=rgba[o+1]=rgba[o+2]=out[s]; rgba[o+3]=out[s+1]; }
  }
  return { width, height, rgba };
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type: string, data: Buffer) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0);
    b.write(type, 4, 'ascii');
    data.copy(b, 8);
    // CRC32 over type + data
    let crc = 0xffffffff;
    const typeData = b.subarray(4, 8 + data.length);
    for (const byte of typeData) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    b.writeUInt32BE(crc, 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- tone mapping: gold → deep gold (print on cream) ----
const RAMP = [
  [196, 154, 84],   // brightest gold lines
  [166, 122, 60],
  [138, 96, 44],
  [110, 74, 32],
  [84, 55, 22],     // deepest strokes
];

function rampAt(t: number) {
  const x = Math.max(0, Math.min(0.999, t)) * (RAMP.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = RAMP[i], b = RAMP[Math.min(i + 1, RAMP.length - 1)];
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f));
}

const src = fs.readFileSync(process.cwd() + '/public/logo.png');
const { width, height, rgba } = decodePng(src);
const outBuf = Buffer.from(rgba);
for (let i = 0; i < width * height; i++) {
  const o = i * 4;
  const a = outBuf[o + 3];
  if (a === 0) continue;
  const r = outBuf[o], g = outBuf[o + 1], b = outBuf[o + 2];
  // luminance → deeper ramp (gold keeps hue via ramp)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const [nr, ng, nb] = rampAt(1 - lum); // darker pixel → deeper stop
  outBuf[o] = nr; outBuf[o + 1] = ng; outBuf[o + 2] = nb;
}
fs.writeFileSync(process.cwd() + '/public/logo-deep.png', encodePng(width, height, outBuf));
console.log(`logo-deep.png regenerated from logo.png (${width}x${height}) — deep gold for cream paper`);
