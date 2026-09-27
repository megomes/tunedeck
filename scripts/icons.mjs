// Generates PWA icons from the brand logo. Run: node scripts/icons.mjs
import sharp from "sharp";

const src = "scripts/logo-source.webp";
const meta = await sharp(src).metadata();
console.log("source", meta.width, meta.height, meta.hasAlpha);

// Trim the transparent/white margin around the rounded-square logo.
const trimmed = await sharp(src).trim({ threshold: 10 }).png().toBuffer();

for (const size of [192, 512]) {
  await sharp(trimmed).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(`public/icons/icon-${size}.png`);
}
// Maskable: full-bleed dark background with the logo inside the safe zone.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.78);
  const logo = await sharp(trimmed).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#0A0A0A" } })
    .composite([{ input: logo, gravity: "center" }]).png().toFile(`public/icons/maskable-${size}.png`);
}
// Apple touch icon: iOS applies its own mask, so fill the square.
{
  const logo = await sharp(trimmed).resize(170, 170, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: "#0A0A0A" } })
    .composite([{ input: logo, gravity: "center" }]).png().toFile("public/icons/apple-touch-icon.png");
}
// favicon.ico with embedded PNGs (what Firefox and most browsers look for first).
{
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((n) => sharp(trimmed).resize(n, n).png().toBuffer()));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = sizes.map((n, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(n, 0);
    e.writeUInt8(n, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });
  const { writeFile } = await import("node:fs/promises");
  await writeFile("public/favicon.ico", Buffer.concat([header, ...entries, ...pngs]));
}
await sharp(trimmed).resize(32, 32).png().toFile("public/icons/favicon-32.png");
await sharp(trimmed).resize(96, 96).png().toFile("public/icons/logo-96.png");
console.log("done");
