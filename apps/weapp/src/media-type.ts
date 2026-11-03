import type { MediaType } from "./types.js";

const REJECTED_EXTENSIONS = [".gif", ".heic", ".heif", ".bmp", ".tif", ".tiff"] as const;

/**
 * Infer a type from a temp-file path.
 * WeChat camera files are jpeg. Some temp paths have no suffix; those are sent as jpeg
 * and the API sniffs the bytes. Known unsupported suffixes are rejected before upload.
 */
export function mediaTypeFromPath(filePath: string): MediaType | null {
  const path = filePath.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (REJECTED_EXTENSIONS.some((extension) => path.endsWith(extension))) return null;
  return "image/jpeg";
}
