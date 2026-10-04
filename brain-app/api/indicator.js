// Nexus / Brain Indicators endpoint (Vercel Edge). The engine lives in ./_nexus (see nexus-engine/README.md).
export const config = { runtime: "edge" };

import { handle } from "./_nexus/handler.js";

export default function handler(req, ctx) {
  return handle(req, ctx);
}
