export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: "Glance", short_name: "Glance", description: "Buy with your eyes.", start_url: "/lens", display: "standalone", background_color: "#000000", theme_color: "#000000",
    icons: [
      { src: "/icons/icon-96.png", sizes: "96x96", type: "image/png" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } });
}
