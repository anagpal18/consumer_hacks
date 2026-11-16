import type { Category } from "./lib";

export type ColorFamily = "black" | "grey" | "white" | "beige" | "brown" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";

export type RenderAsset = { key: string; slot: string; category: Category; subtypes: string[]; colorFamily: ColorFamily };

export const RENDER_ASSETS: RenderAsset[] = [
  { key: "demo/jacket-denim", slot: "outerwear", category: "outerwear", subtypes: ["denim jacket", "jean jacket", "trucker jacket"], colorFamily: "blue" },
  { key: "demo/shirt-white", slot: "top", category: "top", subtypes: ["shirt", "oxford shirt", "button-down shirt", "button-up shirt", "dress shirt"], colorFamily: "white" },
  { key: "demo/tee-black", slot: "top", category: "top", subtypes: ["t-shirt", "tee", "crew neck t-shirt", "crewneck t-shirt"], colorFamily: "black" },
  { key: "demo/trousers-charcoal", slot: "bottom", category: "bottom", subtypes: ["trousers", "pants", "slacks", "dress pants"], colorFamily: "grey" },
  { key: "demo/sneakers-white", slot: "shoes", category: "shoes", subtypes: ["sneakers", "trainers", "canvas sneakers", "low-top sneakers"], colorFamily: "white" },
  { key: "demo/boots-brown", slot: "shoes", category: "shoes", subtypes: ["boots", "ankle boots", "chelsea boots", "leather boots"], colorFamily: "brown" },
];

export function colorFamily(hex: string | undefined): ColorFamily | undefined {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  if (l < 0.16) return "black";
  if (s < 0.2) {
    if (l < 0.35) return "black";
    if (h >= 30 && h < 65 && s >= 0.08 && l > 0.5 && l < 0.8) return "beige";
    return l > 0.72 ? "white" : "grey";
  }
  if (l > 0.85) return "white";
  if (h >= 20 && h < 50) {
    if (l > 0.55 && s < 0.45) return "beige";
    if (l < 0.45) return "brown";
    return "orange";
  }
  if (h < 12 || h >= 345) return l > 0.75 ? "pink" : "red";
  if (h < 20) return l < 0.35 ? "brown" : "orange";
  if (h < 70) return l > 0.5 && s < 0.35 ? "beige" : "yellow";
  if (h < 170) return "green";
  if (h < 255) return "blue";
  if (h < 300) return "purple";
  return "pink";
}

type ScanMatchInput = { category: Category; subtype: string; color?: string; pattern?: string; colorHex?: string };

const has = (text: string, words: string[]) => words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(text));

/**
 * Scanned-closet keys, matched on the detector's own words (subtype, color, pattern) because pixel
 * colors of hanging pieces in dim frames are unreliable. Each rule needs the garment type and the
 * color word; anything else falls through to the color-swatch match below or stays unmapped.
 */
const SCAN_RULES: { key: string; categories: Category[]; match: (subtype: string, color: string, pattern: string) => boolean }[] = [
  {
    key: "demo/hoodie-grey-zip",
    categories: ["top", "outerwear"],
    match: (s, c) => has(s, ["hoodie", "hooded sweatshirt"]) && has(c, ["gray", "grey", "heather"]),
  },
  {
    key: "demo/flannel-navy-plaid",
    categories: ["top", "outerwear"],
    match: (s, c, p) => (has(s, ["shirt", "flannel"]) && !has(s, ["t-shirt", "tee"])) && (p === "plaid" || has(s, ["flannel"])) && has(c, ["navy"]),
  },
  {
    key: "demo/shirt-lightblue",
    categories: ["top"],
    match: (s, c, p) =>
      has(s, ["shirt"]) && !has(s, ["t-shirt", "tee", "denim", "chambray"]) && has(c, ["light blue", "pale blue", "sky blue"]) && (p === "" || p === "solid"),
  },
  {
    key: "demo/blazer-navy",
    categories: ["outerwear"],
    match: (s, c, p) => has(s, ["blazer", "suit jacket", "sport coat", "sports coat"]) && has(c, ["navy"]) && (p === "" || p === "solid"),
  },
  {
    key: "demo/jeans-darkwash",
    categories: ["bottom"],
    match: (s, c) => has(s, ["jeans"]) && has(c, ["dark blue", "dark wash", "indigo", "navy", "dark denim", "dark indigo"]),
  },
];

export const SCAN_RENDER_KEYS = SCAN_RULES.map((r) => r.key);

export function matchRenderAsset(item: ScanMatchInput): string | undefined {
  if (item.category === "underwear" || item.category === "socks") return undefined;
  const subtype = item.subtype.trim().toLowerCase();
  const color = (item.color ?? "").trim().toLowerCase();
  const pattern = (item.pattern ?? "").trim().toLowerCase();
  const rule = SCAN_RULES.find((r) => r.categories.includes(item.category) && r.match(subtype, color, pattern));
  if (rule) return rule.key;
  const family = colorFamily(item.colorHex);
  if (!family) return undefined;
  const match = RENDER_ASSETS.find(
    (a) =>
      a.category === item.category &&
      a.colorFamily === family &&
      a.subtypes.some((s) => subtype === s || subtype.endsWith(` ${s}`)),
  );
  return match?.key;
}
