import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules/cesium/Build/Cesium");
const destination = join(root, "public/cesium");

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

for (const directory of ["Assets", "ThirdParty", "Widgets", "Workers"]) {
  cpSync(join(source, directory), join(destination, directory), { recursive: true });
}

console.log("Copied Cesium Workers, Assets, Widgets, and ThirdParty to public/cesium");
