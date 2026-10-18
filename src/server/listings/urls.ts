/**
 * URL safety shared by the server routes that fetch or hand off third-party links
 * (product pages, photos, phone handoffs). Public https names only.
 */

export function publicHttpsUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    // Public names only: no IP literals, localhost or internal suffixes.
    if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}
