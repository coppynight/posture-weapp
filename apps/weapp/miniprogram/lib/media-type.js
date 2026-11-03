"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mediaTypeFromPath = mediaTypeFromPath;
const REJECTED_EXTENSIONS = [".gif", ".heic", ".heif", ".bmp", ".tif", ".tiff"];
/**
 * Infer a type from a temp-file path.
 * WeChat camera files are jpeg. Some temp paths have no suffix; those are sent as jpeg
 * and the API sniffs the bytes. Known unsupported suffixes are rejected before upload.
 */
function mediaTypeFromPath(filePath) {
    var _a, _b, _c;
    const path = (_c = (_b = (_a = filePath.split("?")[0]) === null || _a === void 0 ? void 0 : _a.split("#")[0]) === null || _b === void 0 ? void 0 : _b.toLowerCase()) !== null && _c !== void 0 ? _c : "";
    if (path.endsWith(".png"))
        return "image/png";
    if (path.endsWith(".webp"))
        return "image/webp";
    if (path.endsWith(".jpg") || path.endsWith(".jpeg"))
        return "image/jpeg";
    if (REJECTED_EXTENSIONS.some((extension) => path.endsWith(extension)))
        return null;
    return "image/jpeg";
}
