import { describe, expect, test } from "vitest";
import { matchRenderAsset } from "./renderAssets";
import type { Category } from "./lib";

type Row = [Category, string, string, string, string, string];

// Real gpt-6.1-terra detections of pixverse_c1.mp4 on a local backend (3 runs), labelled against the HEHE-23 ground truth.
const RUNS: Row[][] = [
  [
    ["outerwear","blazer","brown","plaid","#978676","f2"],
    ["top","hoodie","gray","solid","#aeaead","f4"],
    ["top","hoodie","gray","solid","#90908d","f7"],
    ["top","t-shirt","beige","solid","#c5bbaf","f5"],
    ["top","shirt","light blue","solid","#8799af","f8"],
    ["top","shirt","navy blue","plaid","#2d334c","f11"],
    ["underwear","briefs","gray","print","#b3b4b2","f13"],
    ["underwear","briefs","white","print","#d3d4d1","f13"],
    ["accessory","cap","navy blue","solid","#040609","f14"],
    ["accessory","cap","black","solid","#070d0e","f14"],
    ["outerwear","blazer","navy blue","solid","#01070f","f9"],
    ["outerwear","jacket","dark gray","solid","#2c3035","f1"],
    ["top","t-shirt","beige","solid","#0e0f11","f1"],
    ["bottom","jeans","dark blue","solid","#0c1a25","f10"],
    ["top","shirt","blue","solid","#04080b","f10"],
    ["bottom","pants","olive","solid","#544933","f12"],
    ["top","shirt","white","solid","#060b0c","f1"],
    ["top","shirt","light blue","solid","#070f12","f1"],
    ["bottom","pants","tan","solid","#0f0e0a","f1"],
    ["top","shirt","gray","plaid","#0a0d0f","f1"],
  ],
  [
    ["outerwear","blazer","brown","plaid","#978676","f2"],
    ["top","zip-up hoodie","gray","solid","#929291","f4"],
    ["top","zip-up hoodie","gray","solid","#71706d","f7"],
    ["top","t-shirt","beige","solid","#c4bbb0","f5"],
    ["top","t-shirt","beige","solid","#0e0f11","f1"],
    ["top","shirt","light blue","solid","#8799af","f8"],
    ["outerwear","blazer","navy","solid","#01070f","f9"],
    ["outerwear","jacket","dark gray","solid","#2c3035","f1"],
    ["top","shirt","white","solid","#070c0d","f1"],
    ["top","shirt","light blue","solid","#060f12","f1"],
    ["outerwear","denim jacket","blue","solid","#04090d","f10"],
    ["bottom","jeans","dark blue","solid","#0d1a25","f10"],
    ["top","shirt","navy","plaid","#2d334c","f11"],
    ["bottom","pants","khaki","solid","#544934","f12"],
    ["underwear","briefs","gray","print","#b3b3b1","f12"],
    ["underwear","briefs","white","print","#d3d4d1","f13"],
    ["accessory","cap","navy","solid","#040609","f14"],
    ["accessory","cap","black","solid","#070d0e","f14"],
    ["bottom","pants","tan","solid","#100e0a","f1"],
    ["top","shirt","gray white","plaid","#0b0e0f","f1"],
  ],
  [
    ["outerwear","blazer","brown","plaid","#978676","f2"],
    ["top","zip-up hoodie","gray","solid","#929290","f4"],
    ["top","zip-up hoodie","gray","solid","#72716d","f7"],
    ["top","t-shirt","beige","solid","#c4bbaf","f5"],
    ["top","t-shirt","beige","solid","#0e0f11","f1"],
    ["top","button-up shirt","light blue","solid","#8799af","f8"],
    ["outerwear","blazer","navy","solid","#01070e","f9"],
    ["outerwear","jacket","charcoal","solid","#2c3035","f1"],
    ["top","shirt","white","solid","#070b0c","f1"],
    ["outerwear","jacket","blue","solid","#04090d","f10"],
    ["bottom","jeans","dark blue","solid","#0d1a25","f10"],
    ["top","button-up shirt","navy red","plaid","#2d334d","f11"],
    ["bottom","pants","khaki","solid","#544934","f12"],
    ["underwear","briefs","gray","print","#b4b5b2","f13"],
    ["underwear","briefs","white","print","#d3d4d1","f13"],
    ["accessory","baseball cap","navy","solid","#040609","f14"],
    ["accessory","baseball cap","black","solid","#070d0e","f14"],
    ["bottom","pants","tan","solid","#100f0a","f1"],
    ["top","shirt","gray white","plaid","#0a0e0f","f1"],
  ],
];

const FIVE = ["demo/hoodie-grey-zip", "demo/shirt-lightblue", "demo/flannel-navy-plaid", "demo/blazer-navy", "demo/jeans-darkwash"];

function expected([cat, sub, color, , , frame]: Row) {
  if (cat === "top" && sub.includes("hoodie")) return "demo/hoodie-grey-zip";
  if (cat === "top" && sub.includes("shirt") && color === "light blue") return "demo/shirt-lightblue";
  if (cat === "top" && frame === "f11") return "demo/flannel-navy-plaid";
  if (cat === "outerwear" && sub === "blazer" && color.startsWith("navy")) return "demo/blazer-navy";
  if (cat === "bottom" && sub === "jeans") return "demo/jeans-darkwash";
  return undefined;
}

describe("scan to render key matching", () => {
  test("every run of the demo clip maps the five pieces to their keys and nothing else to them", () => {
    for (const run of RUNS) {
      const mapped = run.map((r) => matchRenderAsset({ category: r[0], subtype: r[1], color: r[2], pattern: r[3] || undefined, colorHex: r[4] }));
      run.forEach((r, i) => {
        const want = expected(r);
        if (want) expect(mapped[i], r.join(" | ")).toBe(want);
        else expect(FIVE, r.join(" | ")).not.toContain(mapped[i]);
      });
      for (const key of FIVE) expect(mapped).toContain(key);
    }
  });

  test("decoys do not swap", () => {
    expect(matchRenderAsset({ category: "top", subtype: "shirt", color: "light blue", pattern: "denim" })).toBeUndefined();
    expect(matchRenderAsset({ category: "top", subtype: "denim shirt", color: "light blue", pattern: "solid" })).toBeUndefined();
    expect(matchRenderAsset({ category: "top", subtype: "shirt", color: "blue", pattern: "solid" })).toBeUndefined();
    expect(matchRenderAsset({ category: "top", subtype: "t-shirt", color: "light blue", pattern: "solid" })).toBeUndefined();
    expect(matchRenderAsset({ category: "top", subtype: "shirt", color: "gray white", pattern: "plaid" })).toBeUndefined();
    expect(matchRenderAsset({ category: "outerwear", subtype: "blazer", color: "brown", pattern: "plaid" })).toBeUndefined();
    expect(matchRenderAsset({ category: "outerwear", subtype: "blazer", color: "navy", pattern: "check" })).toBeUndefined();
    expect(matchRenderAsset({ category: "bottom", subtype: "pants", color: "dark blue" })).toBeUndefined();
    expect(matchRenderAsset({ category: "top", subtype: "hoodie", color: "black" })).toBeUndefined();
  });

  test("underwear and socks never map", () => {
    expect(matchRenderAsset({ category: "underwear", subtype: "briefs", color: "gray", pattern: "print", colorHex: "#b3b4b2" })).toBeUndefined();
    expect(matchRenderAsset({ category: "underwear", subtype: "hoodie", color: "gray" })).toBeUndefined();
    expect(matchRenderAsset({ category: "socks", subtype: "crew socks", color: "navy" })).toBeUndefined();
  });
});
