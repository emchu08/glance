import { pageDetails } from "@/server/listings/page-details";
import { publicHttpsUrl } from "@/server/listings/urls";

/** Shares the listing search's page read, cache and in-flight request. */
export async function GET(request: Request) {
  const page = publicHttpsUrl(new URL(request.url).searchParams.get("url"));
  if (!page) return new Response(null, { status: 400 });
  const { image } = await pageDetails(page.href);
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  return new Response(null, { status: 302, headers: { Location: image, "Cache-Control": "public, max-age=86400" } });
}
