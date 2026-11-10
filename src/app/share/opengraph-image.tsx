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

/** Link preview for WhatsApp & co.: title, the counts and thumbnails of what is being played. */
export default async function Image() {
  await connection();
  const sections = await loadShareSections();
  // What is being learned first, then what is played already.
  const order = ["Aprendendo agora", "Já toco", "Próximas"];
  const thumbs = order
    .flatMap((t) => sections.find((s) => s.title === t)?.items ?? [])
    .map((r) => r.thumb)
    .filter((t): t is string => !!t)
    .slice(0, 6);

  const text = `TUNEDECK${TITLE}${sections.map((s) => `${s.items.length}${s.title.toLowerCase()}`).join("")}0123456789`;
  const fonts = (await Promise.all([inter(400, text), inter(800, text)])).filter((f) => f !== null);

  const png = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "radial-gradient(circle at 0% 0%, #3a0d0d 0%, #0a0a0a 55%)",
          color: "#f5f5f5",
          fontFamily: "Inter",
          padding: 64,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 520 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "8px 18px",
              borderRadius: 999,
              background: "rgba(255,45,45,0.18)",
              color: "#ff5a5a",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 3,
            }}
          >
            TUNEDECK
          </div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 72, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>
            {TITLE}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 14 }}>
            {sections.map((s) => (
              <div key={s.title} style={{ display: "flex", alignItems: "center", fontSize: 30, color: "#b5b5b5" }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: s.tone, marginRight: 16 }} />
                <span style={{ color: "#f5f5f5", fontWeight: 800, marginRight: 12 }}>{s.items.length}</span>
                {s.title.toLowerCase()}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginLeft: "auto", width: 528, alignContent: "center" }}>
          {thumbs.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element -- rendered into the PNG, not the page
            <img key={src} src={src} width={256} height={144} style={{ borderRadius: 14, objectFit: "cover" }} alt="" />
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": contentType } });
}
