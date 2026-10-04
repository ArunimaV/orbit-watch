import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Vercel's Next.js preset runs `next build`, not `npm run build`, so the copy
// has to happen while this config loads. That publishes public/cesium, including
// Cesium.js, before Next collects static files.
const cesiumEntry = path.join(process.cwd(), "node_modules/cesium/Build/Cesium/Cesium.js");
if (!existsSync(cesiumEntry)) {
  throw new Error(
    "Cesium.js is not installed. next build copies node_modules/cesium/Build/Cesium into public/cesium.",
  );
}
execFileSync(process.execPath, [path.join(process.cwd(), "scripts/copy-cesium.mjs")], {
  stdio: "inherit",
});

const nextConfig: NextConfig = {
  // satellite.js v7 is ESM and pulls a WASM build. Keep it external on the server.
  serverExternalPackages: ["satellite.js"],
};

export default nextConfig;
