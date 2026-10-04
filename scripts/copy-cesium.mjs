import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules/cesium/Build/Cesium");
const destination = join(root, "public/cesium");

if (!existsSync(join(source, "Cesium.js"))) {
  console.error(`Cesium build not found at ${source}. Run npm install so cesium is present.`);
  process.exit(1);
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

cpSync(join(source, "Cesium.js"), join(destination, "Cesium.js"));
for (const directory of ["Assets", "ThirdParty", "Widgets", "Workers"]) {
  cpSync(join(source, directory), join(destination, directory), { recursive: true });
}

const required = [
  "Cesium.js",
  "Workers/createTaskProcessorWorker.js",
  "Widgets/widgets.css",
  "Assets/Textures/NaturalEarthII/tilemapresource.xml",
];
for (const relative of required) {
  const target = join(destination, relative);
  if (!existsSync(target) || statSync(target).size === 0) {
    console.error(`Cesium asset missing after copy: public/cesium/${relative}`);
    process.exit(1);
  }
}

console.log("Copied Cesium.js, Workers, Assets, Widgets, and ThirdParty to public/cesium");
