"use node";

import { Jimp } from "jimp";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { dominantHex } from "./color";
import { colorFamily } from "./renderAssets";
import type { Category, Pattern } from "./lib";
import { extractFramesFromVideo } from "./video";

const DEFAULT_MODEL = "gpt-6.1-terra";

function detectConfig() {
  return {
    model: process.env.DETECT_MODEL || DEFAULT_MODEL,
    effort: process.env.DETECT_EFFORT || "low",
    detail: process.env.DETECT_DETAIL || "high",
  };
}
const MODEL_TIMEOUT_MS = 240_000;
const CROP_MAX_SIDE = 512;
const CATEGORIES: Category[] = ["top", "bottom", "outerwear", "dress", "shoes", "socks", "underwear", "accessory"];
const PATTERNS: Pattern[] = ["solid", "plaid", "check", "denim", "stripe", "print", "other"];

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
          "pattern",
        ],
        properties: {
          category: { type: "string", enum: CATEGORIES },
          subtype: { type: "string", description: "Plain garment type, e.g. 't-shirt', 'jeans', 'sneakers'. No brand or fabric guesses." },
          color: { type: "string", description: "Main color in one or two plain words." },
          pattern: {
            type: "string",
            enum: PATTERNS,
            description: "Surface look: solid, plaid (tartan or flannel), check (windowpane, houndstooth, glen check), denim (jean fabric), stripe, print, or other.",
          },
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

const PROMPT = `You catalog garments from frames of one short closet video. The user may show pieces one at a time or pan across a closet.
Return one entry per distinct physical garment. The same piece seen in several frames is ONE entry: pick its clearest frame and list the others in alsoSeenIn.
If two entries look alike (same type and color) and you cannot tell whether they are the same piece or two pieces, keep both, set needsReview true on both, and point similarTo at each other.
Set needsReview for partly hidden, blurry or low-confidence pieces. Do not invent items hidden behind others, brands or fabrics.
List every garment you can see well enough to name its type and color: pieces being shown, hanging on rails, folded on shelves or lying out. Go along each rail and shelf piece by piece, including pieces at the frame edge or partly overlapped by their neighbours. Skip pieces that are mostly hidden, lost in an indistinct folded stack or too blurry to name.
Skip people's bodies, hangers and furniture; a garment someone is wearing counts only if it is clearly presented.
Categories: top (shirts, t-shirts, sweaters, hoodies), bottom (pants, jeans, shorts, skirts), outerwear (jackets, coats, blazers), dress (dresses, jumpsuits), shoes, socks, underwear, accessory (hats, belts, bags, scarves).`;

type Detected = {
  category: Category;
  subtype: string;
  color: string;
  pattern: Pattern;
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
    usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
    output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  };
  console.log("detect usage", config.model, JSON.stringify(json.usage));
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
    const tStart = Date.now();
    try {
      let frames = job.frames;
      if (frames.length === 0 && job.videoStorageId) {
        frames = await extractFramesFromVideo(ctx, job.videoStorageId);
        console.log("detect extract ms", Date.now() - tStart, "frames", frames.length);
        await ctx.runMutation(internal.scans.setFrames, { scanId: args.scanId, attempt: args.attempt, frames });
      }
      const content: unknown[] = [];
      const decodes = new Map<string, Promise<Img>>();
      for (const f of frames) {
        const blob = await ctx.storage.get(f.storageId);
        if (!blob) throw new ScanFailure("BAD_FRAME", `Frame ${f.frameId} is missing from storage. Upload the frames again.`, false);
        const bytes = Buffer.from(await blob.arrayBuffer());
        const type = blob.type && /^image\/(jpeg|png|webp)$/.test(blob.type) ? blob.type : "image/jpeg";
        decodes.set(
          f.frameId,
          Jimp.read(bytes).catch(() => {
            throw new ScanFailure("BAD_FRAME", `Frame ${f.frameId} is not a readable JPEG or PNG.`, false);
          }),
        );
        content.push({ type: "input_text", text: `Frame ${f.frameId} at ${(f.timestampMs / 1000).toFixed(1)}s:` });
        content.push({ type: "input_image", image_url: `data:${type};base64,${bytes.toString("base64")}`, detail: config.detail });
      }
      const decoded = Promise.all([...decodes].map(async ([id, p]) => [id, await p] as const));
      decoded.catch(() => {});
      content.push({ type: "input_text", text: `Frame ids: ${frames.map((f) => f.frameId).join(", ")}. List the distinct garments.` });

      const tModel = Date.now();
      console.log("detect prep ms", tModel - tStart);
      const result = await callModel(content, config).catch(async (e) => {
        await decoded;
        throw e;
      });
      console.log("detect model ms", Date.now() - tModel);
      const images = new Map(await decoded);
      const frameIds = new Set(frames.map((f) => f.frameId));
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
          pattern: PATTERNS.includes(d.pattern) ? d.pattern : undefined,
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
      for (const a of candidates) {
        for (const b of candidates) {
          if (a.index >= b.index || a.category !== b.category || a.frameId === b.frameId) continue;
          if (a.evidenceFrameIds.includes(b.frameId) || b.evidenceFrameIds.includes(a.frameId)) continue;
          const family = colorFamily(a.colorHex);
          if (!family || family !== colorFamily(b.colorHex)) continue;
          for (const [x, y] of [[a, b], [b, a]] as const) {
            if (x.similarToIndexes.includes(y.index)) continue;
            x.similarToIndexes.push(y.index);
            x.uncertain = true;
            x.reviewReason ??= `Looks like another ${family} ${y.subtype}; keep both or merge.`;
          }
        }
      }
      await ctx.runMutation(internal.scans.saveCandidates, { scanId: args.scanId, attempt: args.attempt, model: config.model, candidates });
    } catch (e) {
      const failure =
        e instanceof ScanFailure
          ? e
          : e instanceof ConvexError
            ? new ScanFailure(e.data.code, e.data.message, e.data.retryable ?? true)
            : new ScanFailure("INTERNAL", "Something went wrong while reading the frames. Try again.", true);
      if (!(e instanceof ScanFailure) && !(e instanceof ConvexError)) console.error("scan failed", e);
      await ctx.runMutation(internal.scans.markFailed, {
        scanId: args.scanId,
        attempt: args.attempt,
        error: { code: failure.code, message: failure.message, retryable: failure.retryable },
      });
    }
  },
});
