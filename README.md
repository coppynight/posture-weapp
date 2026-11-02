# posture-weapp

Training-oriented posture selfies for a WeChat mini program. This repository contains the analysis library and a stateless HTTP API.

## Library

[`packages/posture-core`](packages/posture-core) turns a front photo and a side photo into either:

- a Simplified Chinese report (`issues`, `causeGuesses`, 3–5 generic exercise suggestions, and a non-medical `disclaimer`), or
- `RetakeGuidance` when a photo is missing or fails the quality gate.

The quality gate and the missing-photo check both return before the swappable `MultimodalProvider` hard-analysis call. Tests use `MockMultimodalProvider` and do not call a paid model.

## API

[`packages/posture-api`](packages/posture-api) exposes `POST /v1/analyze`. It accepts the two photos, calls the library, and returns `{ report }` or `{ retakeGuidance }`. Image bytes and reports stay in that request. Vendor credentials come from environment variables.

```bash
npm install
npm test
npm run typecheck
npm run smoke
```
