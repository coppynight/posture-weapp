/**
 * T2 origin for `POST /v1/analyze`.
 * DevTools simulator: keep this loopback address and disable domain check.
 * A real phone cannot reach the computer through 127.0.0.1; use an https domain
 * that is listed in the mini program request allowlist.
 *
 * WeChat caps one request at 60 seconds. compressImage keeps the pixel size and
 * only lowers encoding quality so the upload stays within the request budget.
 */
const ANALYZE_TIMEOUT_MS = 60000;
const COMPRESS_QUALITY = 60;

module.exports = {
  apiBaseUrl: "http://127.0.0.1:8787",
  ANALYZE_TIMEOUT_MS,
  COMPRESS_QUALITY,
};
