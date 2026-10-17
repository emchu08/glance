import { fetchPublic, parsePublicHttpsUrl, UrlError } from "@/server/url";

export const dynamic = "force-dynamic";

/** Validate a public HTTPS product page, discover its og:image, redirect to it; 404 when absent, 400 when invalid. */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  try {
    parsePublicHttpsUrl(url);
    const res = await fetchPublic(url, { headers: { accept: "text/html" }, maxBytes: 1_500_000, timeoutMs: 6000 });
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return new Response("Not a product page", { status: 404 });
    const html = (await res.text()).slice(0, 400_000);
    const m = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ?? html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (!m) return new Response("No photo", { status: 404 });
    const img = parsePublicHttpsUrl(new URL(m[1], url).toString());
    return Response.redirect(img.toString(), 302);
  } catch (e) {
    if (e instanceof UrlError) return new Response(e.message, { status: 400 });
    return new Response("No photo", { status: 404 });
  }
}
