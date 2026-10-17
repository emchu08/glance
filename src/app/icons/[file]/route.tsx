import { ImageResponse } from "next/og";

export const dynamic = "force-static";

/** Generated PNG icons: icon-{size}.png, apple-touch-icon-{size}.png, favicon.png (32). Sizes 16–1024. */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = file.match(/^(?:icon|apple-touch-icon|favicon)(?:-(\d{2,4}))?\.png$/);
  if (!m) return new Response("Not found", { status: 404 });
  const size = Math.min(1024, Math.max(16, Number(m[1] ?? 32)));
  const r = Math.round(size * 0.22);
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#3d7bd6 0%,#16132b 100%)", borderRadius: r }}>
        <svg width={size * 0.66} height={size * 0.66} viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 44 Q12 34 24 34 H40 Q48 34 50 42 Q52 34 60 34 H76 Q88 34 92 44" />
          <rect x="12" y="40" width="34" height="24" rx="10" />
          <rect x="54" y="40" width="34" height="24" rx="10" />
          <circle cx="71" cy="52" r="4" fill="#a9cdf5" stroke="none" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
