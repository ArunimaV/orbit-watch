import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // satellite.js v7 is ESM and pulls a WASM build. Keep it external on the server.
  serverExternalPackages: ["satellite.js"],
};

export default nextConfig;
