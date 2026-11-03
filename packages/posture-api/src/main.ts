import { createProviderFromEnv } from "./provider-env.js";
import { listenUrl, startServer } from "./server.js";

const provider = createProviderFromEnv(process.env);
const host = process.env.HOST?.trim() || "127.0.0.1";
const port = readPort(process.env.PORT);
const server = await startServer({ provider, host, port });
console.log(`posture-api listening on ${listenUrl(server)}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}

function readPort(raw: string | undefined): number {
  const text = raw?.trim() || "8787";
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new Error("PORT must be an integer from 0 to 65535");
  }
  return value;
}
