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
    if (h >= 30 && h < 65 && s >= 0.08 && l > 0.5) return "beige";
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

export function matchRenderAsset(item: { category: Category; subtype: string; colorHex?: string }): string | undefined {
  const subtype = item.subtype.trim().toLowerCase();
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
