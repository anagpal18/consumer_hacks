/** Dominant garment color of an RGBA bitmap, ignoring colors that dominate the outer ring (background). */
export function dominantHex(bitmap: { width: number; height: number; data: Uint8Array }): string | undefined {
  const { width: w, height: h, data } = bitmap;
  const px = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const ring = Math.max(1, Math.round(Math.min(w, h) * 0.08));
  const edge: (readonly [number, number, number])[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < ring || y < ring || x >= w - ring || y >= h - ring) edge.push(px(x, y));
    }
  }
  const bins = (keep: (p: readonly [number, number, number]) => boolean) => {
    const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let y = Math.floor(h * 0.15); y < Math.ceil(h * 0.85); y++) {
      for (let x = Math.floor(w * 0.15); x < Math.ceil(w * 0.85); x++) {
        const p = px(x, y);
        if (!keep(p)) continue;
        const k = ((p[0] >> 5) << 6) | ((p[1] >> 5) << 3) | (p[2] >> 5);
        const c = counts.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
        c.n++;
        c.r += p[0];
        c.g += p[1];
        c.b += p[2];
        counts.set(k, c);
      }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n)[0];
  };
  const edgeBins = new Map<number, number>();
  for (const p of edge) {
    const k = ((p[0] >> 5) << 6) | ((p[1] >> 5) << 3) | (p[2] >> 5);
    edgeBins.set(k, (edgeBins.get(k) ?? 0) + 1);
  }
  const background = [...edgeBins.entries()].filter(([, n]) => n > edge.length * 0.15).map(([k]) => k);
  const isBackground = (p: readonly [number, number, number]) =>
    background.includes(((p[0] >> 5) << 6) | ((p[1] >> 5) << 3) | (p[2] >> 5));
  const inner = (Math.ceil(h * 0.85) - Math.floor(h * 0.15)) * (Math.ceil(w * 0.85) - Math.floor(w * 0.15));
  const garment = bins((p) => !isBackground(p));
  const best = garment && garment.n >= inner * 0.15 ? garment : (bins(() => true) ?? garment);
  if (!best) return undefined;
  const hex = (v: number) => Math.round(v / best.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}
