"use node";

import { Jimp } from "jimp";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { dominantHex } from "./color";
import type { Category } from "./lib";

const DEFAULT_MODEL = "gpt-5-mini";

function detectConfig() {
  return {
    model: process.env.DETECT_MODEL || DEFAULT_MODEL,
    effort: process.env.DETECT_EFFORT || "low",
    detail: process.env.DETECT_DETAIL || "high",
  };
}
const MODEL_TIMEOUT_MS = 240_000;
const MODEL_MAX_SIDE = 1024;
const CROP_MAX_SIDE = 512;
const CATEGORIES: Category[] = ["top", "bottom", "outerwear", "dress", "shoes", "socks", "underwear", "accessory"];

const DETECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "subtype",
          "color",
          "frameId",
          "box",
          "alsoSeenIn",
          "confidence",
          "needsReview",
          "reviewReason",
          "similarTo",
        ],
        properties: {
          category: { type: "string", enum: CATEGORIES },
          subtype: { type: "string", description: "Plain garment type, e.g. 't-shirt', 'jeans', 'sneakers'. No brand or fabric guesses." },
          color: { type: "string", description: "Main color in one or two plain words." },
          frameId: { type: "string", description: "Id of the frame with the clearest view of this piece." },
          box: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "w", "h"],
            description: "Tight box around the piece in that frame, as fractions 0-1 of frame width/height; x,y is the top-left corner.",
            properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
          },
          alsoSeenIn: { type: "array", items: { type: "string" }, description: "Other frame ids that show this same physical piece." },
          confidence: { type: "number", description: "0-1 confidence that this is a distinct real garment of this category." },
          needsReview: { type: "boolean" },
          reviewReason: { type: "string", description: "Short reason when needsReview is true, else empty." },
          similarTo: {
            type: "array",
            items: { type: "integer" },
            description: "0-based indexes of other items in this list that might be the same physical piece.",
          },
        },
      },
    },
  },
} as const;

const PROMPT = `You catalog garments from frames of one short closet video. The user shows pieces one at a time.
Return one entry per distinct physical garment. The same piece seen in several frames is ONE entry: pick its clearest frame and list the others in alsoSeenIn.
If two entries look alike (same type and color) and you cannot tell whether they are the same piece or two pieces, keep both, set needsReview true on both, and point similarTo at each other.
Set needsReview for partly hidden, blurry or low-confidence pieces. Do not invent items hidden behind others, brands or fabrics.
Skip people's bodies, hangers, furniture and the person filming unless a garment is clearly being shown; a garment being worn by the person counts only if it is clearly presented.
Categories: top (shirts, t-shirts, sweaters, hoodies), bottom (pants, jeans, shorts, skirts), outerwear (jackets, coats, blazers), dress (dresses, jumpsuits), shoes, socks, underwear, accessory (hats, belts, bags, scarves).`;

type Detected = {
  category: Category;
  subtype: string;
  color: string;
  frameId: string;
  box: { x: number; y: number; w: number; h: number };
  alsoSeenIn: string[];
  confidence: number;
  needsReview: boolean;
  reviewReason: string;
  similarTo: number[];
};

class ScanFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
  }
}

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));

function iou(a: Detected["box"], b: Detected["box"]) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

type Img = Awaited<ReturnType<typeof Jimp.read>>;

async function callModel(content: unknown[], config: ReturnType<typeof detectConfig>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ScanFailure("CONFIG", "Detection is not configured on the server (missing OpenAI key).", false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        reasoning: { effort: config.effort },
        instructions: PROMPT,
        input: [{ role: "user", content }],
        text: { format: { type: "json_schema", name: "closet_detection", strict: true, schema: DETECTION_SCHEMA } },
      }),
    });
  } catch {
    if (controller.signal.aborted) throw new ScanFailure("TIMEOUT", "Detection took too long. Try again with a shorter clip.", true);
    throw new ScanFailure("MODEL_UNREACHABLE", "Could not reach the vision service. Try again.", true);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text();
    console.error("OpenAI error", res.status, body.slice(0, 500));
    throw new ScanFailure(
      "MODEL_ERROR",
      res.status === 429 ? "The vision service is busy. Try again in a minute." : `The vision service failed (HTTP ${res.status}). Try again.`,
      true,
    );
  }
  const json = (await res.json()) as {
    output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  };
  const parts = (json.output ?? []).flatMap((o) => (o.type === "message" ? (o.content ?? []) : []));
  const refusal = parts.find((p) => p.type === "refusal");
  if (refusal) throw new ScanFailure("REFUSED", "The vision service declined these frames. Try a different clip.", true);
  const text = parts.find((p) => p.type === "output_text")?.text;
  if (!text) throw new ScanFailure("MODEL_ERROR", "The vision service returned no result. Try again.", true);
  return JSON.parse(text) as { items: Detected[] };
}

export const run = internalAction({
  args: { scanId: v.id("scans"), attempt: v.number() },
  handler: async (ctx, args) => {
    const job = await ctx.runMutation(internal.scans.beginProcessing, args);
    if (!job) return;
    const config = detectConfig();
    try {
      const images = new Map<string, Img>();
      const content: unknown[] = [];
      for (const f of job.frames) {
        const blob = await ctx.storage.get(f.storageId);
        if (!blob) throw new ScanFailure("BAD_FRAME", `Frame ${f.frameId} is missing from storage. Upload the frames again.`, false);
        let img;
        try {
          img = await Jimp.read(Buffer.from(await blob.arrayBuffer()));
        } catch {
          throw new ScanFailure("BAD_FRAME", `Frame ${f.frameId} is not a readable JPEG or PNG.`, false);
        }
        images.set(f.frameId, img);
        const small = img.clone();
        if (Math.max(small.width, small.height) > MODEL_MAX_SIDE) small.scaleToFit({ w: MODEL_MAX_SIDE, h: MODEL_MAX_SIDE });
        const jpeg = await small.getBuffer("image/jpeg", { quality: 80 });
        content.push({ type: "input_text", text: `Frame ${f.frameId} at ${(f.timestampMs / 1000).toFixed(1)}s:` });
        content.push({ type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: config.detail });
      }
      content.push({ type: "input_text", text: `Frame ids: ${job.frames.map((f) => f.frameId).join(", ")}. List the distinct garments.` });

      const result = await callModel(content, config);
      const frameIds = new Set(job.frames.map((f) => f.frameId));
      const kept: Detected[] = [];
      const indexMap = new Map<number, number>();
      result.items.forEach((d, i) => {
        if (!frameIds.has(d.frameId) || !CATEGORIES.includes(d.category)) return;
        const x = clamp(d.box.x);
        const y = clamp(d.box.y);
        const box = { x, y, w: clamp(d.box.w, 0.02, 1 - x), h: clamp(d.box.h, 0.02, 1 - y) };
        const dup = kept.findIndex(
          (k) => k.frameId === d.frameId && k.category === d.category && k.color === d.color && iou(k.box, box) > 0.7,
        );
        if (dup >= 0) {
          indexMap.set(i, dup);
          return;
        }
        indexMap.set(i, kept.length);
        kept.push({ ...d, box, confidence: clamp(d.confidence), alsoSeenIn: d.alsoSeenIn.filter((id) => frameIds.has(id) && id !== d.frameId) });
      });
      if (kept.length === 0) {
        throw new ScanFailure("NO_ITEMS", "No clothing was found. Hold each piece in view for a second and scan again.", true);
      }

      const candidates = [];
      for (const [index, d] of kept.entries()) {
        const img = images.get(d.frameId)!;
        const pad = 0.04;
        const x0 = Math.floor(clamp(d.box.x - pad) * img.width);
        const y0 = Math.floor(clamp(d.box.y - pad) * img.height);
        const x1 = Math.ceil(clamp(d.box.x + d.box.w + pad) * img.width);
        const y1 = Math.ceil(clamp(d.box.y + d.box.h + pad) * img.height);
        const crop = img.clone().crop({ x: x0, y: y0, w: Math.max(8, x1 - x0), h: Math.max(8, y1 - y0) });
        if (Math.max(crop.width, crop.height) > CROP_MAX_SIDE) crop.scaleToFit({ w: CROP_MAX_SIDE, h: CROP_MAX_SIDE });
        const thumb = crop.clone();
        thumb.scaleToFit({ w: 64, h: 64 });
        const pixelHex = dominantHex(thumb.bitmap);
        const cropBuf = await crop.getBuffer("image/jpeg", { quality: 85 });
        const cropStorageId: Id<"_storage"> = await ctx.storage.store(new Blob([new Uint8Array(cropBuf)], { type: "image/jpeg" }));
        const similarToIndexes = [...new Set(d.similarTo.map((s) => indexMap.get(s)).filter((s): s is number => s !== undefined && s !== index))];
        const uncertain = d.needsReview || d.confidence < 0.6 || similarToIndexes.length > 0;
        candidates.push({
          index,
          frameId: d.frameId,
          evidenceFrameIds: [d.frameId, ...d.alsoSeenIn],
          category: d.category,
          subtype: d.subtype.trim().toLowerCase() || d.category,
          color: d.color.trim().toLowerCase(),
          colorHex: pixelHex,
          cropBox: d.box,
          cropStorageId,
          confidence: d.confidence,
          uncertain,
          reviewReason: uncertain
            ? d.reviewReason || (similarToIndexes.length ? "Looks like another detected piece; keep both or merge." : "Low confidence.")
            : undefined,
          similarToIndexes,
        });
      }
      await ctx.runMutation(internal.scans.saveCandidates, { scanId: args.scanId, attempt: args.attempt, model: config.model, candidates });
    } catch (e) {
      const failure =
        e instanceof ScanFailure ? e : new ScanFailure("INTERNAL", "Something went wrong while reading the frames. Try again.", true);
      if (!(e instanceof ScanFailure)) console.error("scan failed", e);
      await ctx.runMutation(internal.scans.markFailed, {
        scanId: args.scanId,
        attempt: args.attempt,
        error: { code: failure.code, message: failure.message, retryable: failure.retryable },
      });
    }
  },
});
