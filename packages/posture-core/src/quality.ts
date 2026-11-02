import { hasMagic, isMediaType, readImageSize } from "./image-info.js";
import type { PostureImage, QualityReasonCode, RetakeGuidance, RetakeShot, ShotView } from "./types.js";

/** Limits used by the local quality gate before any model call. */
export const IMAGE_QUALITY_REQUIREMENTS = {
  minBytes: 24,
  minEdgePx: 480,
  /** Inclusive lower bound. Values below this are treated as too blurry to analyze. */
  minSharpness: 0.4,
} as const;

const MISSING_CHECKLIST = [
  "请同时准备正面和侧面两张全身自拍，缺一不会分析。",
  "正面照正对镜头，侧面照身体侧对镜头。",
  "头顶到脚尖入画，双臂自然下垂，不要遮挡躯干。",
  "两张都拍好后再开始分析。",
] as const;

const QUALITY_CHECKLIST = [
  "在明亮、均匀的光线下拍摄，避免逆光和严重模糊。",
  "全身入画：头顶到脚尖都在画面内，手机大致放在胸口高度并保持水平。",
  "正面照正对镜头；侧面照身体侧对镜头，手臂不要挡住肩、髋和膝的轮廓。",
  "穿着能看清身体轮廓的衣物，上传清晰原图（JPEG、PNG 或 WebP）。",
] as const;

export interface CheckedImage {
  ok: true;
  image: PostureImage;
}

export interface RejectedImage {
  ok: false;
  shot: RetakeShot;
}

export type ImagePairGate =
  | { status: "ready"; front: PostureImage; side: PostureImage }
  | { status: "retake"; retakeGuidance: RetakeGuidance };

/**
 * Decide whether analysis can run.
 * `status: "retake"` means the hard-analysis path must not run.
 */
export function gateImagePair(front: unknown, side: unknown): ImagePairGate {
  const frontMissing = front == null;
  const sideMissing = side == null;
  if (frontMissing || sideMissing) {
    const shots: RetakeShot[] = [];
    if (frontMissing) shots.push(missingShot("front"));
    if (sideMissing) shots.push(missingShot("side"));
    return { status: "retake", retakeGuidance: missingGuidance(shots) };
  }

  const frontResult = checkImageQuality(front, "front");
  const sideResult = checkImageQuality(side, "side");
  if (frontResult.ok && sideResult.ok) {
    return { status: "ready", front: frontResult.image, side: sideResult.image };
  }

  const shots: RetakeShot[] = [];
  if (!frontResult.ok) shots.push(frontResult.shot);
  if (!sideResult.ok) shots.push(sideResult.shot);
  return { status: "retake", retakeGuidance: poorQualityGuidance(shots) };
}

export function checkImageQuality(input: unknown, view: ShotView): CheckedImage | RejectedImage {
  const reasons: QualityReasonCode[] = [];
  if (!isImageRecord(input) || !(input.data instanceof Uint8Array)) {
    reasons.push("empty");
  } else if (input.data.length === 0) {
    reasons.push("empty");
  } else if (input.data.length < IMAGE_QUALITY_REQUIREMENTS.minBytes) {
    reasons.push("too_small");
  }

  const mediaType = isImageRecord(input) ? input.mediaType : undefined;
  if (!isMediaType(mediaType)) {
    reasons.push("unsupported_type");
  }

  const sharpness = isImageRecord(input) ? input.sharpness : undefined;
  if (sharpness !== undefined) {
    if (typeof sharpness !== "number" || !Number.isFinite(sharpness) || sharpness < 0 || sharpness > 1) {
      reasons.push("invalid_signal");
    } else if (sharpness < IMAGE_QUALITY_REQUIREMENTS.minSharpness) {
      reasons.push("blurry");
    }
  }

  const blockedBeforeHeader =
    reasons.includes("empty") || reasons.includes("too_small") || reasons.includes("unsupported_type");
  if (!blockedBeforeHeader && isImageRecord(input) && input.data instanceof Uint8Array && isMediaType(mediaType)) {
    if (!hasMagic(input.data, mediaType)) {
      reasons.push("corrupt");
    } else {
      const size = readImageSize(input.data, mediaType);
      if (!size) {
        reasons.push("unreadable");
      } else if (
        size.width < IMAGE_QUALITY_REQUIREMENTS.minEdgePx ||
        size.height < IMAGE_QUALITY_REQUIREMENTS.minEdgePx
      ) {
        reasons.push("low_resolution");
      }
    }
  }

  if (
    reasons.length > 0 ||
    !isImageRecord(input) ||
    !(input.data instanceof Uint8Array) ||
    !isMediaType(input.mediaType)
  ) {
    return { ok: false, shot: poorShot(view, reasons.length > 0 ? reasons : ["unreadable"]) };
  }

  const image: PostureImage = {
    data: input.data,
    mediaType: input.mediaType,
  };
  if (typeof input.sharpness === "number") image.sharpness = input.sharpness;
  return { ok: true, image };
}

function isImageRecord(value: unknown): value is { data?: unknown; mediaType?: unknown; sharpness?: unknown } {
  return typeof value === "object" && value !== null;
}

function missingShot(view: ShotView): RetakeShot {
  return {
    view,
    problem: "missing",
    reasons: ["missing"],
    messages: [missingMessage(view)],
  };
}

function poorShot(view: ShotView, reasons: readonly QualityReasonCode[]): RetakeShot {
  return {
    view,
    problem: "poor_quality",
    reasons,
    messages: reasons.map((reason) => reasonMessage(view, reason)),
  };
}

function missingGuidance(shots: readonly RetakeShot[]): RetakeGuidance {
  const views = shots.map((shot) => shotLabel(shot.view)).join("和");
  const summary =
    shots.length === 2
      ? "需要同时提供正面和侧面两张全身照。缺少照片时不会做体态分析。"
      : `还缺少${views}，本次不会做体态分析。请补拍后再试。`;
  return {
    schemaVersion: 1,
    code: "missing_image",
    summary,
    shots,
    checklist: MISSING_CHECKLIST,
  };
}

function poorQualityGuidance(shots: readonly RetakeShot[]): RetakeGuidance {
  const views = shots.map((shot) => shotLabel(shot.view)).join("和");
  const summary =
    shots.length === 2
      ? "正面和侧面照片质量都不够，本次只给出重拍指引，不会做体态分析。"
      : `${views}照片质量不够，本次只给出重拍指引，不会做体态分析。`;
  return {
    schemaVersion: 1,
    code: "poor_quality",
    summary,
    shots,
    checklist: QUALITY_CHECKLIST,
  };
}

function shotLabel(view: ShotView): string {
  return view === "front" ? "正面" : "侧面";
}

function missingMessage(view: ShotView): string {
  if (view === "front") {
    return "缺少正面全身照。请正对镜头补拍，头顶到脚尖都要入画。";
  }
  return "缺少侧面全身照。请身体侧对镜头补拍，头顶到脚尖都要入画。";
}

function reasonMessage(view: ShotView, reason: QualityReasonCode): string {
  const label = view === "front" ? "正面照片" : "侧面照片";
  switch (reason) {
    case "missing":
      return missingMessage(view);
    case "empty":
      return `${label}内容为空。请重新拍摄并上传。`;
    case "too_small":
      return `${label}文件过小，可能不完整。请重新拍摄后上传原图。`;
    case "unsupported_type":
      return `${label}格式无法使用。请上传 JPEG、PNG 或 WebP 原图。`;
    case "corrupt":
      return `${label}无法识别为有效图片。请重新拍摄后上传。`;
    case "unreadable":
      return `${label}读不出尺寸。请重新拍摄，并上传未损坏的原图。`;
    case "low_resolution":
      return `${label}分辨率过低，看不清全身轮廓。请提高清晰度后重拍。`;
    case "blurry":
      return `${label}过于模糊。请持稳手机、对焦清楚后重拍。`;
    case "invalid_signal":
      return `${label}的清晰度信息不完整。请重新拍摄后上传。`;
  }
}
