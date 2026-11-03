import { COPY } from "./copy.js";
import type { LocalShot, Report, RetakeGuidance, ShotView } from "./types.js";

export interface SessionState {
  front: LocalShot | null;
  side: LocalShot | null;
  report: Report | null;
  retakeGuidance: RetakeGuidance | null;
  notice: string | null;
  submitting: boolean;
  /** Camera and album hide the mini program. That hide must not wipe the other photo. */
  pickerOpen: boolean;
  /** Album permission and the settings sheet also hide the mini program. */
  sheetOpen: boolean;
}

export interface ShotPaths {
  frontPath: string | null;
  sidePath: string | null;
}

export interface HideResult extends ShotPaths {
  cleared: boolean;
}

export interface SessionStore {
  /** Increases when the session is wiped, so an in-flight request cannot write back. */
  generation(): number;
  get(): SessionState;
  replaceShot(shot: LocalShot): string | null;
  removeShot(view: ShotView): string | null;
  setNotice(message: string | null): void;
  setSubmitting(value: boolean): void;
  setReport(report: Report): void;
  setRetake(guidance: RetakeGuidance): void;
  clearReport(): void;
  clearShots(): ShotPaths;
  markPicker(open: boolean): void;
  /** Keep the in-memory report while an album or settings sheet is open. */
  holdSession(open: boolean): void;
  /** Drop the in-memory session. Returns temp paths so the caller can delete those files. */
  clear(): ShotPaths;
  /**
   * End the session when the guest leaves the mini program.
   * A system picker also fires hide; that one keeps the photos already chosen.
   */
  onAppHide(): HideResult;
}

export function emptySessionState(): SessionState {
  return {
    front: null,
    side: null,
    report: null,
    retakeGuidance: null,
    notice: null,
    submitting: false,
    pickerOpen: false,
    sheetOpen: false,
  };
}

export function createSessionStore(): SessionStore {
  let state = emptySessionState();
  let generation = 0;

  function paths(): ShotPaths {
    return {
      frontPath: state.front ? state.front.tempFilePath : null,
      sidePath: state.side ? state.side.tempFilePath : null,
    };
  }

  function wipe(notice: string | null): ShotPaths {
    const removed = paths();
    generation += 1;
    state = emptySessionState();
    state.notice = notice;
    return removed;
  }

  function slot(view: ShotView): LocalShot | null {
    return view === "front" ? state.front : state.side;
  }

  return {
    generation() {
      return generation;
    },
    get() {
      return {
        front: state.front ? { ...state.front } : null,
        side: state.side ? { ...state.side } : null,
        report: state.report,
        retakeGuidance: state.retakeGuidance,
        notice: state.notice,
        submitting: state.submitting,
        pickerOpen: state.pickerOpen,
        sheetOpen: state.sheetOpen,
      };
    },
    replaceShot(shot) {
      const previous = slot(shot.view);
      const stored: LocalShot = {
        view: shot.view,
        tempFilePath: shot.tempFilePath,
        mediaType: shot.mediaType,
      };
      if (shot.view === "front") state.front = stored;
      else state.side = stored;
      state.notice = null;
      state.retakeGuidance = null;
      if (!previous || previous.tempFilePath === shot.tempFilePath) return null;
      return previous.tempFilePath;
    },
    removeShot(view) {
      const previous = slot(view);
      if (view === "front") state.front = null;
      else state.side = null;
      state.retakeGuidance = null;
      return previous ? previous.tempFilePath : null;
    },
    setNotice(message) {
      state.notice = message;
    },
    setSubmitting(value) {
      state.submitting = value;
    },
    setReport(report) {
      state.report = report;
      state.retakeGuidance = null;
      state.notice = null;
    },
    setRetake(guidance) {
      state.retakeGuidance = guidance;
      state.report = null;
      state.notice = null;
    },
    clearReport() {
      state.report = null;
    },
    clearShots() {
      const removed = paths();
      state.front = null;
      state.side = null;
      return removed;
    },
    markPicker(open) {
      state.pickerOpen = open;
    },
    holdSession(open) {
      state.sheetOpen = open;
    },
    clear() {
      return wipe(null);
    },
    onAppHide() {
      if (state.pickerOpen || state.sheetOpen) {
        return { cleared: false, frontPath: null, sidePath: null };
      }
      const hadContent = state.front !== null || state.side !== null || state.report !== null || state.retakeGuidance !== null;
      const removed = wipe(hadContent ? COPY.sessionEnded : null);
      return { cleared: true, frontPath: removed.frontPath, sidePath: removed.sidePath };
    },
  };
}
