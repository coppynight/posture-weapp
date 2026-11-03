import type { PostureImage } from "./types.js";

/** Input to the hard-analysis path. Both photos have already passed the gates. */
export interface AnalyzePostureRequest {
  front: PostureImage;
  side: PostureImage;
  systemPrompt: string;
  /** Fixed user-turn text from the core. Send this with the photos. */
  userPrompt: string;
}

/**
 * Swappable multimodal backend.
 * `analyzePosture` is the only hard-analysis method. The library calls it
 * after both images are present and the quality gate has passed.
 */
export interface MultimodalProvider {
  analyzePosture(input: AnalyzePostureRequest): Promise<unknown>;
}
