"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideSubmit = decideSubmit;
const copy_js_1 = require("./copy.js");
/**
 * Guest-side guard. A single photo never starts a request.
 * The server repeats the same rule; this prompt is the one the guest sees first.
 */
function decideSubmit(front, side) {
    if (front && side)
        return { ok: true };
    if (!front && !side)
        return { ok: false, message: copy_js_1.COPY.missingBoth };
    if (!front)
        return { ok: false, message: copy_js_1.COPY.missingFront };
    return { ok: false, message: copy_js_1.COPY.missingSide };
}
