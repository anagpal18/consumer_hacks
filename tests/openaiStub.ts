import { Jimp } from "jimp";
import { vi } from "vitest";

type Detected = {
  category: string;
  subtype: string;
  color: string;
  frameId: string;
  similarTo?: number[];
  needsReview?: boolean;
  alsoSeenIn?: string[];
};

export async function jpegBlob(color = 0x336699ff, size = 64) {
  const img = new Jimp({ width: size, height: size, color });
  return new Blob([new Uint8Array(await img.getBuffer("image/jpeg"))], { type: "image/jpeg" });
}

function responseText(text: string) {
  return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function stubOpenAI(detected: Detected[]) {
  const calls = { detect: 0, stylist: 0 };
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      if (body.text.format.name === "closet_detection") {
        calls.detect++;
        const items = detected.map((d) => ({
          category: d.category,
          subtype: d.subtype,
          color: d.color,
          colorHex: "#123456",
          frameId: d.frameId,
          box: { x: 0.1, y: 0.1, w: 0.6, h: 0.7 },
          alsoSeenIn: d.alsoSeenIn ?? [],
          confidence: 0.9,
          needsReview: d.needsReview ?? false,
          reviewReason: d.needsReview ? "Looks like another piece" : "",
          similarTo: d.similarTo ?? [],
        }));
        return responseText(JSON.stringify({ items }));
      }
      if (body.text.format.name === "stylist_picks") {
        calls.stylist++;
        const line = (body.input as string).split("\n").find((l) => l.startsWith("Look 0: "))!;
        const itemIds = line
          .slice("Look 0: ".length)
          .split(" + ")
          .map((part) => part.split(" (")[0]);
        return responseText(JSON.stringify({ picks: [{ itemIds, reason: "Sharp but relaxed for dinner." }] }));
      }
      throw new Error("unexpected fetch");
    }),
  );
  return calls;
}
