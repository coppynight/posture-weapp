import { analyzePhotos } from "./analyze.js";
import { COPY } from "./copy.js";
import { mediaTypeFromPath } from "./media-type.js";
import type { SessionStore } from "./session.js";
import { decideSubmit } from "./submit.js";
import type { PhotoPayload, ShotView, Transport } from "./types.js";

export type PickResult =
  | { status: "picked"; tempFilePath: string }
  | { status: "cancelled" }
  | { status: "failed" };

export type PhotoSource = "camera" | "album";

export interface PickDeps {
  choose(source: PhotoSource): Promise<PickResult>;
  unlink(filePath: string | null): void;
}

export interface SubmitDeps {
  read(shot: { view: ShotView; tempFilePath: string; mediaType: PhotoPayload["mediaType"] }): Promise<PhotoPayload>;
  transport: Transport;
  baseUrl: string;
  unlink(filePath: string | null): void;
  openReport(): void;
}

export type SubmitResult = "report" | "retake" | "blocked" | "error";

export async function pickImage(
  store: SessionStore,
  view: ShotView,
  source: PhotoSource,
  deps: PickDeps,
): Promise<void> {
  if (store.get().submitting) return;
  store.markPicker(true);
  try {
    const picked = await deps.choose(source);
    if (picked.status === "cancelled") return;
    if (picked.status === "failed") {
      store.setNotice(COPY.pickerFail);
      return;
    }
    if (picked.tempFilePath.trim() === "") {
      store.setNotice(COPY.emptyPick);
      return;
    }
    const mediaType = mediaTypeFromPath(picked.tempFilePath);
    if (!mediaType) {
      store.setNotice(COPY.badType);
      return;
    }
    const previousPath = store.replaceShot({ view, tempFilePath: picked.tempFilePath, mediaType });
    deps.unlink(previousPath);
  } finally {
    store.markPicker(false);
  }
}

export function removeImage(store: SessionStore, view: ShotView, unlink: (filePath: string | null) => void): void {
  if (store.get().submitting) return;
  unlink(store.removeShot(view));
}

/**
 * Read both temp files and call T2.
 * One missing photo sets a prompt and does not read or upload anything.
 * After a report, temp paths are dropped so the photos are not kept as an archive.
 */
export async function submitAnalysis(store: SessionStore, deps: SubmitDeps): Promise<SubmitResult> {
  const current = store.get();
  if (current.submitting) return "blocked";
  const decision = decideSubmit(current.front, current.side);
  if (!decision.ok) {
    store.setNotice(decision.message);
    return "blocked";
  }
  const front = current.front;
  const side = current.side;
  if (!front || !side) return "blocked";

  const generation = store.generation();
  store.setSubmitting(true);
  store.setNotice(null);
  try {
    const frontPhoto = await deps.read(front);
    const sidePhoto = await deps.read(side);
    const outcome = await analyzePhotos(deps.transport, deps.baseUrl, frontPhoto, sidePhoto);
    if (store.generation() !== generation) return "blocked";
    if (outcome.kind === "report") {
      store.setReport(outcome.report);
      const removed = store.clearShots();
      deps.unlink(removed.frontPath);
      deps.unlink(removed.sidePath);
      deps.openReport();
      return "report";
    }
    if (outcome.kind === "retake") {
      store.setRetake(outcome.retakeGuidance);
      return "retake";
    }
    store.setNotice(outcome.message);
    return "error";
  } catch {
    if (store.generation() !== generation) return "blocked";
    store.setNotice(COPY.readFail);
    return "error";
  } finally {
    if (store.generation() === generation) store.setSubmitting(false);
  }
}

export function endSession(store: SessionStore, unlink: (filePath: string | null) => void): void {
  const removed = store.clear();
  unlink(removed.frontPath);
  unlink(removed.sidePath);
}
