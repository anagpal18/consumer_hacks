"use node";

import { Jimp } from "jimp";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

/** Swap these when the contract (HEHE-13) fixes the final preset keys and sex values. */
export const AVATAR_SEXES = ["female", "male", "unspecified"] as const;
export const AVATAR_PRESETS = ["slim", "average", "broad"] as const;
export type AvatarSex = (typeof AVATAR_SEXES)[number];
export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

const PROPORTIONS = ["head", "chest", "arms", "waist", "hips", "shoulders"] as const;
type Proportions = Record<(typeof PROPORTIONS)[number], number>;
const MODEL_TIMEOUT_MS = 60_000;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["usable", "reason", "sex", "build", "proportions", "faceBox", "confidence"],
  properties: {
    usable: { type: "boolean", description: "True only for a clear photo of one person showing most of the body, head to at least the knees." },
    reason: { type: "string", description: "Short reason when not usable or when confidence is low, else empty." },
    sex: { type: "string", enum: ["female", "male", "unspecified"] },
    build: { type: "string", enum: [...AVATAR_PRESETS] },
    proportions: {
      type: "object",
      additionalProperties: false,
      required: [...PROPORTIONS],
      description: "Relative to an average adult of the same sex and height: -1 much smaller, 0 average, 1 much larger.",
      properties: Object.fromEntries(PROPORTIONS.map((k) => [k, { type: "number" }])),
    },
    faceBox: {
      type: "object",
      additionalProperties: false,
      required: ["found", "x", "y", "w", "h"],
      description: "Box around the whole face, hairline to chin and ear to ear, as fractions 0-1 of the image (x,y top-left); found false if no face is visible.",
      properties: { found: { type: "boolean" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
    },
    confidence: { type: "number", description: "0-1 confidence in the build and proportions." },
  },
} as const;

type ModelOut = {
  usable: boolean;
  reason: string;
  sex: AvatarSex;
  build: AvatarPreset;
  proportions: Proportions;
  faceBox: { found: boolean; x: number; y: number; w: number; h: number };
  confidence: number;
};

const clamp = (n: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, typeof n === "number" && Number.isFinite(n) ? n : 0));
const round = (n: number) => Math.round(n * 100) / 100;

const SKIN_SAMPLES = [
  { x: 0.3, y: 0.12, w: 0.4, h: 0.16 },
  { x: 0.14, y: 0.45, w: 0.2, h: 0.18 },
  { x: 0.66, y: 0.45, w: 0.2, h: 0.18 },
  { x: 0.4, y: 0.42, w: 0.2, h: 0.14 },
];

function skinToneFromFace(img: Awaited<ReturnType<typeof Jimp.read>>, face: ModelOut["faceBox"]) {
  const fx = clamp(face.x, 0, 1);
  const fy = clamp(face.y, 0, 1);
  const fw = clamp(face.w, 0, 1 - fx);
  const fh = clamp(face.h, 0, 1 - fy);
  if (fw * img.width < 4 || fh * img.height < 4) return null;
  const { data, width, height } = img.bitmap;
  const all: number[][] = [];
  for (const s of SKIN_SAMPLES) {
    const x0 = Math.floor((fx + fw * s.x) * width);
    const y0 = Math.floor((fy + fh * s.y) * height);
    const x1 = Math.min(width, Math.ceil((fx + fw * (s.x + s.w)) * width));
    const y1 = Math.min(height, Math.ceil((fy + fh * (s.y + s.h)) * height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        all.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  }
  if (!all.length) return null;
  const skinLike = all.filter(([r, g, b]) => r > 60 && r >= g && g >= b * 0.85 && r - b > 10 && r - b < 140);
  const px = skinLike.length >= Math.max(4, all.length * 0.15) ? skinLike : all;
  const med = (c: number) => px.map((p) => p[c]).sort((p, q) => p - q)[Math.floor(px.length / 2)];
  return `#${[0, 1, 2].map((c) => med(c).toString(16).padStart(2, "0")).join("")}`;
}

async function askModel(imageDataUrl: string, hints: string): Promise<ModelOut> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing OpenAI key");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.DETECT_MODEL || "gpt-6.1-terra",
        reasoning: { effort: process.env.DETECT_EFFORT || "low" },
        instructions:
          "You set up a stylised 3D avatar from one onboarding photo. Estimate overall build and relative body proportions only; this is approximate and private. Do not identify the person or comment on attractiveness. If the photo is not a clear, mostly full-body view of one person, set usable false and say why.",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: `Known facts from the user (do not contradict): ${hints || "none"}.` },
              { type: "input_image", image_url: imageDataUrl, detail: process.env.DETECT_DETAIL || "high" },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "body_estimate", strict: true, schema: SCHEMA } },
      }),
    });
    if (!res.ok) throw new Error(`model HTTP ${res.status}`);
    const json = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[] };
    const text = (json.output ?? []).flatMap((o) => (o.type === "message" ? (o.content ?? []) : [])).find((p) => p.type === "output_text")?.text;
    if (!text) throw new Error("model returned no result");
    return JSON.parse(text) as ModelOut;
  } finally {
    clearTimeout(timer);
  }
}

export const estimateBody = action({
  args: {
    closetCode: v.string(),
    photoStorageId: v.id("_storage"),
    heightCm: v.optional(v.number()),
    sex: v.optional(v.union(...AVATAR_SEXES.map((s) => v.literal(s)))),
  },
  handler: async (ctx, args) => {
    const profileId: Id<"profiles"> = await ctx.runMutation(internal.bodyPhotos.claim, {
      closetCode: args.closetCode,
      photoStorageId: args.photoStorageId,
    });
    const heightCm = args.heightCm !== undefined ? round(clamp(args.heightCm, 50, 250)) : undefined;
    const fallback = (notes: string, sex: AvatarSex = args.sex ?? "unspecified", skinTone: string | null = null) => ({
      body: {
        sex,
        preset: "average" as AvatarPreset,
        skinTone,
        heightCm,
        proportions: Object.fromEntries(PROPORTIONS.map((k) => [k, 0])) as Proportions,
      },
      confidence: 0.1,
      notes,
    });

    let result;
    const blob = await ctx.storage.get(args.photoStorageId);
    if (!blob) {
      result = fallback("The photo is missing from storage; upload it again.");
    } else {
      const bytes = Buffer.from(await blob.arrayBuffer());
      let img: Awaited<ReturnType<typeof Jimp.read>> | null = null;
      try {
        img = await Jimp.read(bytes);
      } catch {
        img = null;
      }
      if (!img) {
        result = fallback("The photo could not be read; try a JPEG or PNG.");
      } else {
        const hints = [args.sex ? `sex: ${args.sex}` : "", heightCm ? `height: ${heightCm} cm` : ""].filter(Boolean).join(", ");
        const type = /^image\/(jpeg|png|webp)$/.test(blob.type) ? blob.type : "image/jpeg";
        let out: ModelOut | null = null;
        try {
          out = await askModel(`data:${type};base64,${bytes.toString("base64")}`, hints);
        } catch (e) {
          console.error("estimateBody model failed", e instanceof Error ? e.message : e);
        }
        if (!out) {
          result = fallback("Body estimate is unavailable right now; using the average preset.");
        } else {
          const sex: AvatarSex = args.sex ?? (AVATAR_SEXES.includes(out.sex) ? out.sex : "unspecified");
          const skinTone = out.faceBox?.found ? skinToneFromFace(img, out.faceBox) : null;
          if (!out.usable) {
            result = fallback(out.reason?.trim() || "Use a clear full-body photo to personalise the avatar.", sex, skinTone);
          } else {
            const confidence = round(clamp(out.confidence, 0, 1));
            result = {
              body: {
                sex,
                preset: AVATAR_PRESETS.includes(out.build) ? out.build : ("average" as AvatarPreset),
                skinTone,
                heightCm,
                proportions: Object.fromEntries(PROPORTIONS.map((k) => [k, round(clamp(out.proportions?.[k], -1, 1))])) as Proportions,
              },
              confidence,
              notes: out.reason?.trim() || "Approximate estimate from your photo; adjust anything that looks off.",
            };
          }
        }
      }
    }
    await ctx.runMutation(internal.bodyPhotos.saveEstimate, { profileId, photoStorageId: args.photoStorageId, estimate: result });
    return result;
  },
});
