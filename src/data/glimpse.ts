import type { Candidate, Offer } from "./types";

export const SAMPLE_LATENCY_MS = 600;

export const STREET_CANDIDATES: Record<string, Candidate> = {
  "gray-sweater": {
    id: "gray-sweater",
    label: "Gray crewneck sweater",
    category: "apparel",
    attributes: ["gray", "knit", "crew neck"],
    confidence: 0.9,
    box: { x: 0.43, y: 0.56, width: 0.2, height: 0.3 },
    primary: true,
  },
  "black-backpack": {
    id: "black-backpack",
    label: "Black backpack",
    category: "bags",
    attributes: ["black", "zip top"],
    confidence: 0.8,
    box: { x: 0.46, y: 0.6, width: 0.13, height: 0.24 },
  },
  "red-shoulder-bag": {
    id: "red-shoulder-bag",
    label: "Red shoulder bag",
    category: "bags",
    attributes: ["red"],
    confidence: 0.55,
    box: { x: 0.28, y: 0.55, width: 0.05, height: 0.1 },
  },
};

/** Frame progression: 1 → sweater+backpack, 2 → adds red bag, 3 → back to sweater+backpack. */
export const STREET_FRAMES: string[][] = [
  ["gray-sweater", "black-backpack"],
  ["gray-sweater", "black-backpack", "red-shoulder-bag"],
  ["gray-sweater", "black-backpack"],
];

export const STREET_FRAME_CAPTIONS = [
  "Street view · sample frame 1",
  "Same view, a moment later · sample frame 2",
  "Same view, a moment later · sample frame 3",
];

const search = (base: string, param: string, q: string) =>
  `${base}?${param}=${encodeURIComponent(q)}`;

export const SAMPLE_OFFERS: Offer[] = [
  {
    id: "uniqlo-crew-sweater-gray",
    candidateId: "gray-sweater",
    name: "Crew neck knit sweater, gray",
    retailer: "Uniqlo",
    url: search("https://www.uniqlo.com/us/en/search", "q", "crew neck sweater gray"),
    imageUrl: "/samples/sweater.svg",
    priceCents: 2990,
    match: "similar",
    evidence: "gray · crew neck · knit",
    kind: "external_link",
    origin: "sample",
  },
  {
    id: "gap-crew-sweater-heather",
    candidateId: "gray-sweater",
    name: "Crewneck sweater, heather gray",
    retailer: "Gap",
    url: search("https://www.gap.com/browse/search.do", "searchText", "crewneck sweater gray"),
    imageUrl: "/samples/sweater.svg",
    priceCents: 4995,
    match: "similar",
    evidence: "gray · crew neck · knit",
    kind: "external_link",
    origin: "sample",
  },
  {
    id: "target-crew-sweater-gray",
    candidateId: "gray-sweater",
    name: "Crew neck pullover sweater, gray",
    retailer: "Target",
    url: search("https://www.target.com/s", "searchTerm", "gray crew neck sweater"),
    imageUrl: "/samples/sweater.svg",
    priceCents: 2500,
    match: "similar",
    evidence: "gray · crew neck",
    kind: "external_link",
    origin: "sample",
  },
  {
    id: "temu-knit-pullover-gray",
    candidateId: "gray-sweater",
    name: "Knit pullover, light gray",
    retailer: "Temu",
    url: search("https://www.temu.com/search_result.html", "search_key", "gray crew neck sweater"),
    imageUrl: "/samples/sweater.svg",
    priceCents: 1099,
    match: "similar",
    evidence: "gray · knit",
    kind: "external_link",
    origin: "sample",
  },
  {
    id: "herschel-classic-black",
    candidateId: "black-backpack",
    name: "Classic backpack, black",
    retailer: "Herschel",
    url: search("https://herschel.com/search", "q", "classic backpack black"),
    imageUrl: "/samples/backpack.svg",
    priceCents: 5500,
    match: "possible",
    evidence: "black · zip top",
    kind: "external_link",
    origin: "sample",
  },
  {
    id: "target-daypack-black",
    candidateId: "black-backpack",
    name: "Everyday daypack, black",
    retailer: "Target",
    url: search("https://www.target.com/s", "searchTerm", "black backpack"),
    imageUrl: "/samples/backpack.svg",
    priceCents: 3000,
    match: "similar",
    evidence: "black",
    kind: "external_link",
    origin: "sample",
  },
  {
    id: "amazon-laptop-backpack-black",
    candidateId: "black-backpack",
    name: "Laptop backpack, black",
    retailer: "Amazon",
    url: search("https://www.amazon.com/s", "k", "black backpack"),
    imageUrl: "/samples/backpack.svg",
    priceCents: 2799,
    match: "similar",
    evidence: "black · laptop sleeve",
    kind: "external_link",
    origin: "sample",
  },
];

const SWEATER_TOKENS = ["sweater", "sweatshirt", "crewneck", "crew neck", "pullover", "jumper", "knit", "cardigan"];
const BACKPACK_TOKENS = ["backpack", "rucksack", "daypack", "bag"];

export function sampleOfferGroupFor(label: string): "sweater" | "backpack" | null {
  const l = label.toLowerCase();
  if (SWEATER_TOKENS.some((t) => l.includes(t))) return "sweater";
  if (BACKPACK_TOKENS.some((t) => l.includes(t))) return "backpack";
  return null;
}

export function sampleOffersFor(label: string): Offer[] {
  const group = sampleOfferGroupFor(label);
  if (!group) return [];
  const candidateId = group === "sweater" ? "gray-sweater" : "black-backpack";
  return SAMPLE_OFFERS.filter((o) => o.candidateId === candidateId);
}
