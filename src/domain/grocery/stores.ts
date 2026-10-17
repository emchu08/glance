import { STORES } from "@/data/grocery";
import type { Store } from "@/data/types";

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function storesByDistance(lat: number, lng: number, stores: Store[] = STORES): Array<Store & { km: number }> {
  return stores
    .map((s) => ({ ...s, km: haversineKm(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.km - b.km);
}

export function walkingDirectionsUrl(origin: { lat: number; lng: number } | null, store: Store): string {
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  if (origin) u.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  u.searchParams.set("destination", `${store.name}, ${store.address}`);
  u.searchParams.set("travelmode", "walking");
  return u.toString();
}

export const formatKm = (km: number) => (km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);
