import { describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import { buildCombos, diverse } from "./stylist";

type Cat = "top" | "bottom" | "outerwear" | "dress" | "shoes" | "accessory";
const mk = (n: number, category: Cat) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `${category}${i}` as Id<"items">,
    name: `${category} ${i}`,
    category,
    subtype: `${category}-kind-${i % 7}`,
    color: ["black", "white", "navy"][i % 3],
    availability: "available" as const,
    wearCount: 0,
    wearsSinceWash: 0,
    isPrivate: false,
  }));

describe("stylist with a large closet", () => {
  const pool = [...mk(92, "top"), ...mk(62, "bottom"), ...mk(47, "shoes"), ...mk(41, "outerwear"), ...mk(20, "dress")];

  test("buildCombos stays bounded with hundreds of pieces", () => {
    const t0 = Date.now();
    const combos = buildCombos(pool, [], undefined, "dinner");
    expect(combos.length).toBe(60);
    expect(Date.now() - t0).toBeLessThan(1000);
    for (const c of combos) expect(new Set(c.itemIds).size).toBe(c.itemIds.length);
  });

  test("a locked piece is in every combo even when the closet is large", () => {
    const lock = pool.find((i) => i._id === "top91")!;
    const combos = buildCombos(pool, [lock], undefined, "dinner");
    expect(combos.length).toBeGreaterThan(0);
    for (const c of combos) expect(c.itemIds).toContain(lock._id);
  });

  test("different plans rotate which fresh pieces are offered", () => {
    const a = new Set(buildCombos(pool, [], undefined, "dinner").flatMap((c) => c.itemIds));
    const b = new Set(buildCombos(pool, [], undefined, "beach day").flatMap((c) => c.itemIds));
    expect([...a].some((id) => !b.has(id))).toBe(true);
  });

  test("diverse keeps order for small lists and varies subtypes when capping", () => {
    const tops = mk(30, "top");
    expect(diverse(tops.slice(0, 3), 8)).toEqual(tops.slice(0, 3));
    const capped = diverse(tops, 7);
    expect(new Set(capped.map((t) => t.subtype)).size).toBe(7);
  });
});
