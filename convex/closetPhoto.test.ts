import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("setItemPhoto attaches a photo to an existing item without touching its other fields", async () => {
  const t = convexTest(schema, modules);
  const code = "photo-test-closet";
  const added = await t.mutation(api.closet.addItem, { closetCode: code, category: "outerwear", color: "indigo", name: "Denim jacket", colorHex: "#3F5878" });
  expect(added.media.url).toBeNull();
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["jpeg"], { type: "image/jpeg" })));

  await t.mutation(internal.closet.setItemPhoto, { itemId: added.itemId, photoStorageId: storageId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const [item] = await t.query(api.closet.list, { closetCode: code });
  expect(item).toMatchObject({ itemId: added.itemId, name: "Denim jacket", colorHex: "#3F5878", wearCount: 0 });
  expect(item.media.url).toMatch(/^https?:/);
  const media = await t.run((ctx) => ctx.db.query("media").collect());
  expect(media).toHaveLength(1);
  expect(media[0]).toMatchObject({ storageId, kind: "photo" });

  const pdf = await t.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "application/pdf" })));
  await expect(t.mutation(internal.closet.setItemPhoto, { itemId: added.itemId, photoStorageId: pdf })).rejects.toThrow(/JPEG, PNG or WebP/);
});
