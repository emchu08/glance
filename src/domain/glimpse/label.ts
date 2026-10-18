/**
 * The name Glimpse shows for a recognized object. It must be specific enough to shop for:
 * the exact product when one is identified, else brand plus a description, never a bare category.
 */
export interface Described {
  object_type: string;
  brand: string;
  product_name?: string;
  color?: string;
  material?: string;
  style?: string;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Words like "sweater" or "jacket" alone: a category, not a product. */
function isBareCategory(name: string, objectType: string): boolean {
  const n = norm(name);
  return !n || n === norm(objectType) || n.split(" ").length < 2;
}

export function specificLabel(d: Described): string {
  const name = d.product_name?.trim() ?? "";
  if (name && !isBareCategory(name, d.object_type)) return cap(name);
  // No usable name: build one from what was seen, skipping any part the type or brand already says.
  const type = d.object_type.trim() || name;
  const parts: string[] = [];
  for (const part of [d.brand, d.color, d.material, d.style]) {
    const p = part?.trim();
    if (!p) continue;
    const said = norm([...parts, type].join(" "));
    if (!said.includes(norm(p))) parts.push(p);
  }
  return cap([...parts, type].join(" ").replace(/\s+/g, " ").trim());
}
