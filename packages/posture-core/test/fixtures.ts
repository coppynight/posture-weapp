import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MediaType, PostureImage } from "../src/types.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export function fixturePath(name: string): string {
  return join(fixturesDir, name);
}

export function loadFixtureImage(name: string, mediaType: MediaType = "image/png", sharpness?: number): PostureImage {
  const image: PostureImage = {
    data: new Uint8Array(readFileSync(fixturePath(name))),
    mediaType,
  };
  if (sharpness !== undefined) image.sharpness = sharpness;
  return image;
}

export function loadPairFixture(name: string): { description: string; front: PostureImage; side: PostureImage } {
  const raw = JSON.parse(readFileSync(fixturePath(name), "utf8")) as {
    description: string;
    front: string;
    side: string;
  };
  return {
    description: raw.description,
    front: loadFixtureImage(raw.front),
    side: loadFixtureImage(raw.side),
  };
}
