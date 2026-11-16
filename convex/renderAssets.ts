import { RENDER_ASSETS, type RenderAssetMeta } from "../shared/renderAssets";
import type { Category } from "./lib";

export { RENDER_ASSETS };

export type ColorFamily = "black" | "grey" | "white" | "beige" | "brown" | "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink";

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

/** Color family from the detector's color words; pixel colors of hanging pieces in dim frames are unreliable. */
const WORD_FAMILIES: [ColorFamily, string[]][] = [
  ["blue", ["navy", "blue", "indigo", "denim", "chambray"]],
  ["grey", ["gray", "grey", "charcoal", "heather", "slate"]],
  ["beige", ["beige", "tan", "khaki", "olive", "stone", "sand", "camel", "cream", "oatmeal", "taupe"]],
  ["brown", ["brown", "chocolate", "cognac"]],
  ["white", ["white", "ivory", "off-white"]],
  ["black", ["black"]],
  ["green", ["green"]],
  ["red", ["red", "burgundy", "maroon"]],
];

const has = (text: string, words: string[]) => words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(text));

function wordFamily(color: string): ColorFamily | undefined {
  const main = color.split(/\s+(?:and|with)\s+|\//)[0];
  return WORD_FAMILIES.find(([, words]) => has(main, words))?.[0];
}

/** Families close enough to share a mesh: a tan blazer is often called brown. */
const NEAR: Partial<Record<ColorFamily, ColorFamily[]>> = { beige: ["brown"], brown: ["beige"] };

/** Extra words a key needs where its color family alone is too coarse (light-blue shirt vs denim shirt vs navy). */
const SHADE: Record<string, (color: string, subtype: string) => boolean> = {
  "demo/shirt-lightblue": (c, s) => has(c, ["light blue", "pale blue", "sky blue", "baby blue"]) && !has(s, ["denim", "chambray", "flannel"]),
  "demo/blazer-navy": (c) => has(c, ["navy", "dark blue", "midnight"]),
  "demo/flannel-navy-plaid": (c) => has(c, ["navy", "dark blue"]),
  "demo/jeans-darkwash": (c) => !has(c, ["light", "pale", "faded"]),
};

/** Detections below this confidence (partly hidden or edge-of-frame pieces) keep the tinted stand-in. */
export const MATCH_MIN_CONFIDENCE = 0.9;

function patternFits(asset: RenderAssetMeta, pattern: string) {
  const want = asset.pattern ?? "solid";
  if (want === "denim") return true;
  if (want === "plaid" || want === "check") return pattern === "plaid" || pattern === "check";
  return pattern === "" || pattern === "solid";
}

type ScanMatchInput = { category: Category; subtype: string; color?: string; pattern?: string; colorHex?: string; confidence?: number };

/**
 * The render key for a closet item, or undefined. Pure: same category (tops and outerwear may swap, since a
 * zip hoodie is detected as either), a listed subtype, the same color family (from the color words, else from
 * colorHex for the original six solid meshes), a compatible pattern and, for keys in SHADE, the right shade.
 * Underwear, socks and low-confidence detections never map.
 */
export function matchRenderAsset(item: ScanMatchInput): string | undefined {
  if (item.category === "underwear" || item.category === "socks") return undefined;
  if (item.confidence !== undefined && item.confidence < MATCH_MIN_CONFIDENCE) return undefined;
  const subtype = item.subtype.trim().toLowerCase();
  const color = (item.color ?? "").trim().toLowerCase();
  const pattern = (item.pattern ?? "").trim().toLowerCase();
  const fromWords = wordFamily(color);
  const family = fromWords ?? colorFamily(item.colorHex);
  if (!family) return undefined;
  const upper = (c: Category) => (c === "outerwear" || c === "top" ? "upper" : c);
  const fits = (a: RenderAssetMeta, strict: boolean) =>
    upper(a.category) === upper(item.category) &&
    (!strict || a.category === item.category) &&
    a.subtypes.some((s) => subtype === s || subtype.endsWith(` ${s}`)) &&
    (a.colorFamily === family || (!!fromWords && !!NEAR[family]?.includes(a.colorFamily))) &&
    (fromWords !== undefined || a.pattern === undefined) &&
    patternFits(a, pattern) &&
    (SHADE[a.key]?.(color, subtype) ?? true);
  const exact = (a: RenderAssetMeta) => a.colorFamily === family;
  const ranked = [...RENDER_ASSETS.filter((a) => fits(a, true)), ...RENDER_ASSETS.filter((a) => fits(a, false))];
  return (ranked.find(exact) ?? ranked[0])?.key;
}
