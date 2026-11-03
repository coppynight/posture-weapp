import { COPY } from "./copy.js";
import type { LocalShot } from "./types.js";

export type SubmitDecision = { ok: true } | { ok: false; message: string };

/**
 * Guest-side guard. A single photo never starts a request.
 * The server repeats the same rule; this prompt is the one the guest sees first.
 */
export function decideSubmit(front: LocalShot | null, side: LocalShot | null): SubmitDecision {
  if (front && side) return { ok: true };
  if (!front && !side) return { ok: false, message: COPY.missingBoth };
  if (!front) return { ok: false, message: COPY.missingFront };
  return { ok: false, message: COPY.missingSide };
}
