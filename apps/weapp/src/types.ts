export type MediaType = "image/jpeg" | "image/png" | "image/webp";

export type ShotView = "front" | "side";

export type IssueSeverity = "mild" | "moderate" | "marked";

/** One chosen photo. The path is a WeChat temp file, not a saved archive. */
export interface LocalShot {
  view: ShotView;
  tempFilePath: string;
  mediaType: MediaType;
}

/** JSON photo object accepted by `POST /v1/analyze`. */
export interface PhotoPayload {
  mediaType: MediaType;
  dataBase64: string;
}

export interface PostureIssue {
  title: string;
  detail: string;
  severity: IssueSeverity;
}

export interface CauseGuess {
  relatedIssueTitle?: string;
  guess: string;
}

export interface ExerciseSuggestion {
  name: string;
  instruction: string;
  addresses?: string;
}

/** Fields the report page renders. Analysis itself stays on the server. */
export interface Report {
  schemaVersion: 1;
  issues: PostureIssue[];
  causeGuesses: CauseGuess[];
  exerciseSuggestions: ExerciseSuggestion[];
  disclaimer: string;
}

export interface RetakeShot {
  view: ShotView;
  problem: "missing" | "poor_quality";
  reasons: string[];
  messages: string[];
}

export interface RetakeGuidance {
  schemaVersion: 1;
  code: "missing_image" | "poor_quality";
  summary: string;
  shots: RetakeShot[];
  checklist: string[];
}

export type AnalyzeOutcome =
  | { kind: "report"; report: Report }
  | { kind: "retake"; retakeGuidance: RetakeGuidance }
  | { kind: "error"; message: string };

export interface TransportResponse {
  status: number;
  text: string;
}

export interface Transport {
  postJson(url: string, body: unknown): Promise<TransportResponse>;
}
