import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const dynamic = "force-static";

// The Glance logo (the iOS app icon artwork). Read once; each size is drawn from it.
const LOGO = `data:image/png;base64,${await readFile(join(process.cwd(), "public/brand/ios-icon-blue-1024.png"), "base64")}`;

/**
 * Generated PNG icons: icon-{size}.png, apple-touch-icon-{size}.png, favicon.png (32). Sizes 16–1024.
 * Apple touch icons stay square (iOS rounds them); the rest get rounded corners.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = file.match(/^(icon|apple-touch-icon|favicon)(?:-(\d{2,4}))?\.png$/);
  if (!m) return new Response("Not found", { status: 404 });
  const size = Math.min(1024, Math.max(16, Number(m[2] ?? 32)));
  const r = m[1] === "apple-touch-icon" ? 0 : Math.round(size * 0.22);
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", borderRadius: r, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
        <img src={LOGO} width={size} height={size} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
