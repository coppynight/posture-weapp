# posture-weapp

Training-oriented posture selfies for a WeChat mini program. This repository contains the analysis library, a stateless HTTP API, and the guest mini program.

## Library

[`packages/posture-core`](packages/posture-core) turns a front photo and a side photo into either:

- a Simplified Chinese report (`issues`, `causeGuesses`, 3–5 generic exercise suggestions, and a non-medical `disclaimer`), or
- `RetakeGuidance` when a photo is missing or fails the quality gate.

The quality gate and the missing-photo check both return before the swappable `MultimodalProvider` hard-analysis call. Tests use `MockMultimodalProvider` and do not call a paid model.

## API

[`packages/posture-api`](packages/posture-api) exposes `POST /v1/analyze`. It accepts the two photos, calls the library, and returns `{ report }` or `{ retakeGuidance }`. Image bytes and reports stay in that request. Vendor credentials come from environment variables.

## Mini program

[`apps/weapp`](apps/weapp) is the guest client. It collects a front photo and a side photo, calls `POST /v1/analyze`, and shows either the training report or retake guidance. The report page leads with the non-medical disclaimer. From that page, 保存分享卡 writes a 750×1334 summary PNG to the phone album (`wx.saveImageToPhotosAlbum`); the guest forwards that image in WeChat. The card shows the main problem, exercise tips, and the disclaimer, and it does not include the selfies. Photos, the report, and the temp PNG stay in the current visit; there is no history page and no login. Set the API origin in `apps/weapp/miniprogram/config.js`. The DevTools checklist is in the app README.

```bash
npm install
npm test
npm run typecheck
npm run smoke
```
