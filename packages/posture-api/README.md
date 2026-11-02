# posture-api

Stateless HTTP API for one posture check. It accepts a front photo and a side photo, calls [`posture-core`](../posture-core) `analyze`, and returns either a Simplified Chinese report or retake guidance.

Guests can call it without a token. Vendor credentials are read from the environment. Image bytes and reports stay in the request handler and are not written to disk, object storage, or a database.

## Endpoint

`POST /v1/analyze`

Multipart form fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `front` | yes | Front photo (`image/jpeg`, `image/png`, or `image/webp`) |
| `side` | yes | Side photo |
| `frontSharpness` | no | Optional sharpness from 0 to 1 |
| `sideSharpness` | no | Optional sharpness from 0 to 1 |

The same pair can be sent as `application/json`. Each photo is `{ "mediaType", "dataBase64", "sharpness?" }`. `dataBase64` may be raw base64 or a `data:` URL. A null or omitted photo is treated as missing.

Each photo may be up to 12 MB, and the whole request may be up to 24 MB. Larger uploads get `413` and are not analyzed.

Success (`200`):

```json
{ "report": { "schemaVersion": 1, "issues": [], "causeGuesses": [], "exerciseSuggestions": [], "disclaimer": "…" } }
```

`report.disclaimer` is the fixed non-medical notice from the core. Every successful report includes it.

Missing photo (`400`):

```json
{ "retakeGuidance": { "schemaVersion": 1, "code": "missing_image", "summary": "…", "shots": [], "checklist": [] } }
```

Failed quality gate (`422`):

```json
{ "retakeGuidance": { "schemaVersion": 1, "code": "poor_quality", "summary": "…", "shots": [], "checklist": [] } }
```

A response contains `report` or `retakeGuidance`, not both. Quality failures and missing photos do not call the provider. Responses send `Cache-Control: no-store`.

`GET /healthz` returns `{ "ok": true }` and does not analyze.

## Run

```bash
POSTURE_PROVIDER=mock npm start
```

The process listens on `127.0.0.1:8787` unless `HOST` and `PORT` are set.

| Variable | Purpose |
| --- | --- |
| `POSTURE_PROVIDER` | `mock` or `openai-compatible` (`openai` is the same adapter) |
| `POSTURE_API_KEY` | Vendor key. Required for `openai-compatible`. Never read from the request. |
| `POSTURE_API_BASE_URL` | Vendor origin. Defaults to `https://api.openai.com/v1`. Must be `http` or `https`. |
| `POSTURE_MODEL` | Model name. Required for `openai-compatible`. |
| `POSTURE_PROVIDER_TIMEOUT_MS` | Vendor call budget. Defaults to 30000. |
| `HOST`, `PORT` | Bind address. Default `127.0.0.1:8787`. |

Swap the vendor by passing another `MultimodalProvider` to `startServer`, or by changing `POSTURE_PROVIDER`. The core still owns the system prompt, the quality gate, and the disclaimer.

```bash
curl -s -F front=@front.png -F side=@side.png http://127.0.0.1:8787/v1/analyze
```

## Checks

```bash
npm test
npm run typecheck
npm run smoke
```

`npm test` and `npm run smoke` use the mock provider. They do not call a paid model.
