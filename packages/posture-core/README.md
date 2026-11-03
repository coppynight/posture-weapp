# posture-core

Library slice for posture analysis: report schema, fixed system prompt, image gates, and a swappable multimodal provider.

```ts
import { analyze, MockMultimodalProvider } from "posture-core";

const result = await analyze(front, side, {
  provider: new MockMultimodalProvider(),
  // systemPromptPath: "./custom-prompt.txt", // optional; default is the built-in prompt
});

if (result.status === "report") {
  result.report.disclaimer; // canonical non-medical text
} else {
  result.retakeGuidance; // missing photo or retake instructions, no findings
}
```

`analyze` calls `provider.analyzePosture` only after both images exist and pass the local quality gate (readable JPEG, PNG, or WebP header, each edge at least 480px, optional `sharpness` of at least 0.4). The request carries the resolved system prompt and the fixed `DEFAULT_USER_PROMPT`. The provider must return parsed JSON, or a JSON string, matching the report schema. The library overwrites `disclaimer` with `REPORT_DISCLAIMER`.

Replace `MockMultimodalProvider` with any object that implements `MultimodalProvider`.
