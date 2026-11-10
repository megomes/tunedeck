import { ImageResponse } from "next/og";
import { connection } from "next/server";
import sharp from "sharp";
import { loadShareSections } from "./data";

export const alt = "O que estou tocando, no TuneDeck";
export const size = { width: 1200, height: 630 };
// JPEG: the PNG with photos is ~600 KB, too big for WhatsApp previews.
export const contentType = "image/jpeg";

const TITLE = "O que estou tocando";

/** Inter from Google Fonts, only the glyphs used (TTF, which the image renderer reads). Falls back to the default font. */
async function inter(weight: number, text: string) {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`)
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return { name: "Inter", data: await (await fetch(url)).arrayBuffer(), weight: weight as 400 | 800, style: "normal" as const };
  } catch {
    return null;
  }
}

const W = 1200;
const H = 630;
const COLS = 5;
const TILE_W = W / COLS;
const TILE_H = Math.round((TILE_W * 9) / 16);
const ROWS = Math.ceil(H / TILE_H);

/**
 * Link preview for WhatsApp & co. WhatsApp often shows only a square cut from the middle,
 * so the title and counts sit in the center, over a dimmed mosaic of the song thumbnails.
 */
export default async function Image() {
  await connection();
  const sections = await loadShareSections();
  // What is being learned first, then what is played already, then the rest.
  const order = ["Aprendendo agora", "Já toco", "Próximas", "Backlog"];
  const all = [...new Set(order.flatMap((t) => sections.find((s) => s.title === t)?.items ?? []).map((r) => r.thumb).filter((t): t is string => !!t))];
  const tiles = all.length ? Array.from({ length: COLS * ROWS }, (_, i) => all[i % all.length]) : [];

  const text = `TUNEDECK${TITLE}${sections.map((s) => `${s.items.length}${s.title.toLowerCase()}`).join("")}0123456789`;
  const fonts = (await Promise.all([inter(400, text), inter(800, text)])).filter((f) => f !== null);
  const counts = sections.filter((s) => s.title !== "Backlog");

  const png = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0a0a0a", fontFamily: "Inter" }}>
        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexWrap: "wrap", overflow: "hidden" }}>
          {tiles.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- rendered into the image, not the page
            <img key={i} src={src} width={TILE_W} height={TILE_H} style={{ objectFit: "cover" }} alt="" />
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            display: "flex",
            background: "radial-gradient(circle at 50% 50%, rgba(10,10,10,0.97) 0%, rgba(10,10,10,0.9) 32%, rgba(10,10,10,0.55) 75%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: W,
            height: H,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#f5f5f5",
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "8px 20px",
              borderRadius: 999,
              background: "rgba(255,45,45,0.2)",
              color: "#ff5a5a",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: 4,
            }}
          >
            TUNEDECK
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              marginTop: 22,
              fontSize: 92,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: -3,
            }}
          >
            <span>O que estou</span>
            <span>tocando</span>
          </div>
          <div style={{ display: "flex", gap: 28, marginTop: 36 }}>
            {counts.map((s) => (
              <div key={s.title} style={{ display: "flex", alignItems: "center", fontSize: 30, color: "#d0d0d0" }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: s.tone, marginRight: 10 }} />
                <span style={{ color: "#fff", fontWeight: 800, marginRight: 9 }}>{s.items.length}</span>
                {s.title === "Aprendendo agora" ? "aprendendo" : s.title.toLowerCase()}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": contentType } });
}
