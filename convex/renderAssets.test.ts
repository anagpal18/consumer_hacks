import { describe, expect, test } from "vitest";
import { dominantHex } from "./color";
import { colorFamily, matchRenderAsset, RENDER_ASSETS } from "./renderAssets";

describe("renderAssetKey matching", () => {
  test("matches only on category, subtype and color family", () => {
    expect(matchRenderAsset({ category: "outerwear", subtype: "denim jacket", colorHex: "#7691aa" })).toBe("demo/jacket-denim");
    expect(matchRenderAsset({ category: "top", subtype: "t-shirt", colorHex: "#2c292a" })).toBe("demo/tee-black");
    expect(matchRenderAsset({ category: "shoes", subtype: "canvas sneakers", colorHex: "#bdc3c8" })).toBe("demo/sneakers-white");
    expect(matchRenderAsset({ category: "top", subtype: "t-shirt", colorHex: "#f1eee8" })).toBeUndefined();
    expect(matchRenderAsset({ category: "top", subtype: "hoodie", colorHex: "#222226" })).toBeUndefined();
    expect(matchRenderAsset({ category: "bottom", subtype: "pants", colorHex: "#aeab98" })).toBeUndefined();
    expect(matchRenderAsset({ category: "top", subtype: "t-shirt" })).toBeUndefined();
  });

  test("every demo key's own sample color maps back to itself", () => {
    const samples: Record<string, string> = {
      "demo/jacket-denim": "#3F5878",
      "demo/shirt-white": "#F1EEE8",
      "demo/tee-black": "#1E1E1E",
      "demo/trousers-charcoal": "#5a5a60",
      "demo/sneakers-white": "#EDEAE4",
      "demo/boots-brown": "#6B4630",
    };
    for (const a of RENDER_ASSETS) {
      expect(matchRenderAsset({ category: a.category, subtype: a.subtypes[0], colorHex: samples[a.key] })).toBe(a.key);
    }
    expect(colorFamily("#B49A72")).toBe("beige");
  });

  test("dominant color ignores a background border", () => {
    const w = 20;
    const data = new Uint8Array(w * w * 4);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const inner = x >= 4 && x < 16 && y >= 4 && y < 16;
        data.set(inner ? [30, 60, 160, 255] : [230, 150, 40, 255], (y * w + x) * 4);
      }
    }
    expect(colorFamily(dominantHex({ width: w, height: w, data }))).toBe("blue");
  });
});
