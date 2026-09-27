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
await sharp(trimmed).resize(64, 64).png().toFile("src/app/icon.png");
await sharp(trimmed).resize(96, 96).png().toFile("public/icons/logo-96.png");
console.log("done");
