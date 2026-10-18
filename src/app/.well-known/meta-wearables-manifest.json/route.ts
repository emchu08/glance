export const dynamic = "force-static";

/**
 * Meta Wearables app manifest: the name and icon Meta Ray-Ban Display shows for Glance when it is
 * launched by URL (/lens, so the manifest sits at the root's .well-known). The glasses read this, not
 * favicons: transparent monochrome artwork tinted with theme_color (the logo's blue).
 */
export function GET() {
  const manifest = {
    version: 1,
    name: "Glance",
    description: "Buy with your eyes.",
    appearance: {
      theme_color: "#B0CCF3",
      icon: { src: "/brand/glasses-icon-mono.png", type: "monochrome" },
    },
  };
  return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
