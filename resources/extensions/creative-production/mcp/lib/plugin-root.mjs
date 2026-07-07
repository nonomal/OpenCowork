import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLUGIN_ROOT =
  path.basename(MODULE_DIR) === "mcp"
    ? path.resolve(MODULE_DIR, "..")
    : path.resolve(MODULE_DIR, "..", "..");

export function pluginRoot() {
  return path.resolve(process.env.CREATIVE_PRODUCTION_PLUGIN_ROOT || DEFAULT_PLUGIN_ROOT);
}

export function pluginPath(...parts) {
  return path.join(pluginRoot(), ...parts);
}
