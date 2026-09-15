// Renders public/icon.svg to the PNG sizes the PWA manifest and iOS need.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url));
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

await Promise.all([
  sharp(svg).resize(192, 192).png().toFile(out('icon-192.png')),
  sharp(svg).resize(512, 512).png().toFile(out('icon-512.png')),
  sharp(svg).resize(180, 180).png().toFile(out('apple-touch-icon.png')),
]);
console.log('icons written: icon-192.png, icon-512.png, apple-touch-icon.png');
