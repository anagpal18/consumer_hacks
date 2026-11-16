import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { cut, descriptor } from "./schema";

/**
 * Writes a descriptor (fabric, fit, formality, warmth, occasions, summary) for a closet item from its
 * photo, so the stylist and the closet-gap finder know what the piece is beyond "black jeans".
 * Scheduled after a scan is confirmed or an item is added with a photo. Best effort: without an
 * OpenAI key or on any error the item simply keeps no descriptor.
 */
export const photoFor = internalQuery({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item?.photoStorageId || item.descriptor) return null;
    const url = await ctx.storage.getUrl(item.photoStorageId);
    return url ? { url, label: `${item.color} ${item.subtype} (${item.category})` } : null;
  },
});

export const save = internalMutation({
  args: { itemId: v.id("items"), descriptor, cut },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item || item.descriptor) return null;
    await ctx.db.patch("items", item._id, { descriptor: args.descriptor, cut: args.cut });
    return null;
  },
});

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fabric", "fit", "pattern", "formality", "warmth", "seasons", "occasions", "summary", "cut"],
  properties: {
    fabric: { type: "string" },
    fit: { type: "string" },
    pattern: { type: "string" },
    formality: { type: "integer", minimum: 1, maximum: 5 },
    warmth: { type: "integer", minimum: 1, maximum: 5 },
    seasons: { type: "array", items: { type: "string", enum: ["spring", "summer", "autumn", "winter"] } },
    occasions: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    cut: { type: "string", enum: ["mens", "womens", "unisex"] },
  },
};

export const item = internalAction({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const photo = await ctx.runQuery(internal.describe.photoFor, { itemId: args.itemId });
    if (!photo) return null;
    try {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_DESCRIBE_MODEL || "gpt-5-mini",
          reasoning: { effort: "minimal" },
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: `Describe this garment (${photo.label}) for a menswear stylist. formality: 1 gym/lounge, 2 casual, 3 smart casual, 4 business, 5 formal. warmth: 1 hot-weather to 5 winter coat. occasions: 3-5 short phrases. summary: 1-2 plain sentences on look, fabric and what it pairs with. cut: who it is cut for.`,
                },
                { type: "input_image", image_url: photo.url },
              ],
            },
          ],
          text: { format: { type: "json_schema", name: "descriptor", strict: true, schema: SCHEMA } },
        }),
      });
      if (!res.ok) return null;
      const body = await res.json();
      const text = body.output?.find((o: { type: string }) => o.type === "message")?.content?.[0]?.text;
      if (!text) return null;
      const { cut: c, ...d } = JSON.parse(text);
      await ctx.runMutation(internal.describe.save, { itemId: args.itemId, descriptor: d, cut: c });
    } catch {
      return null;
    }
    return null;
  },
});
