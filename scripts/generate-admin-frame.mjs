import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const size = 96;
const frameCount = 32;
const frameDelay = 10;
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputPath = join(projectRoot, 'assets', 'admin-frame-gold.gif');
const bytes = [];

function pushString(value) {
  for (const character of value) bytes.push(character.charCodeAt(0));
}

function pushUint16(value) {
  bytes.push(value & 0xff, (value >> 8) & 0xff);
}

function pushSubBlocks(data) {
  for (let offset = 0; offset < data.length; offset += 255) {
    const block = data.slice(offset, offset + 255);
    bytes.push(block.length, ...block);
  }
  bytes.push(0);
}

function encodeLiteralLzw(pixels) {
  const output = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const writeCode = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += 9;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  const clearCode = 256;
  const endCode = 257;
  writeCode(clearCode);
  let codesSinceClear = 0;
  for (const pixel of pixels) {
    if (codesSinceClear === 220) {
      writeCode(clearCode);
      codesSinceClear = 0;
    }
    writeCode(pixel);
    codesSinceClear += 1;
  }
  writeCode(endCode);
  if (bitCount > 0) output.push(bitBuffer & 0xff);
  return output;
}

function drawSparkle(pixels, centerX, centerY, radius, paletteIndex) {
  const setPixel = (x, y, color) => {
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    if (roundedX >= 0 && roundedX < size && roundedY >= 0 && roundedY < size) {
      pixels[(roundedY * size) + roundedX] = color;
    }
  };

  setPixel(centerX, centerY, 4);
  for (let distance = 1; distance <= radius; distance += 1) {
    const color = distance === radius ? 6 : paletteIndex;
    setPixel(centerX + distance, centerY, color);
    setPixel(centerX - distance, centerY, color);
    setPixel(centerX, centerY + distance, color);
    setPixel(centerX, centerY - distance, color);
  }
  if (radius > 1) {
    setPixel(centerX + 1, centerY + 1, 6);
    setPixel(centerX - 1, centerY - 1, 6);
    setPixel(centerX + 1, centerY - 1, 6);
    setPixel(centerX - 1, centerY + 1, 6);
  }
}

function renderFrame(frame) {
  const pixels = new Uint8Array(size * size);
  const center = (size - 1) / 2;
  const rotation = (frame / frameCount) * Math.PI * 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const radius = Math.hypot(dx, dy);
      if (radius < 38.25 || radius > 47.25) continue;

      const angle = Math.atan2(dy, dx) - rotation;
      const radialLight = 1 - Math.abs(radius - 42.75) / 4.5;
      const movingLight = Math.sin((angle * 5) + .35) + .55 * Math.sin((angle * 11) - .8);
      let color = movingLight > .92 ? 3 : movingLight > -.15 ? 2 : 1;
      if (radialLight > .82 && movingLight > .2) color = 5;
      if (radius < 39.2 || radius > 46.35) color = movingLight > .45 ? 6 : 1;
      pixels[(y * size) + x] = color;
    }
  }

  for (let index = 0; index < 12; index += 1) {
    const angle = rotation + (index / 12) * Math.PI * 2 + Math.sin(index * 4.17) * .13;
    const orbit = 42.8 + Math.sin((index * 2.3) + rotation * 2) * 1.3;
    const pulse = (Math.sin((frame * .82) + (index * 2.07)) + 1) / 2;
    if (pulse < .48) continue;
    const sparkleRadius = pulse > .9 ? 3 : pulse > .7 ? 2 : 1;
    drawSparkle(
      pixels,
      center + Math.cos(angle) * orbit,
      center + Math.sin(angle) * orbit,
      sparkleRadius,
      pulse > .78 ? 4 : 3
    );
  }
  return pixels;
}

pushString('GIF89a');
pushUint16(size);
pushUint16(size);
bytes.push(0xf7, 0, 0);

const palette = [
  [0, 0, 0],
  [116, 69, 0],
  [211, 143, 10],
  [255, 205, 55],
  [255, 250, 205],
  [244, 174, 25],
  [255, 230, 125],
  [145, 91, 2]
];
for (let index = 0; index < 256; index += 1) {
  bytes.push(...(palette[index] || [0, 0, 0]));
}

bytes.push(0x21, 0xff, 0x0b);
pushString('NETSCAPE2.0');
bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);

for (let frame = 0; frame < frameCount; frame += 1) {
  bytes.push(0x21, 0xf9, 0x04, 0x09);
  pushUint16(frameDelay);
  bytes.push(0x00, 0x00);
  bytes.push(0x2c);
  pushUint16(0);
  pushUint16(0);
  pushUint16(size);
  pushUint16(size);
  bytes.push(0x00, 0x08);
  pushSubBlocks(encodeLiteralLzw(renderFrame(frame)));
}
bytes.push(0x3b);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Uint8Array.from(bytes));
console.log(`Animated admin frame generated: ${outputPath} (${bytes.length} bytes).`);
