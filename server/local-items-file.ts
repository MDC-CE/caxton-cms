/**
 * Read and write the items file of a local database (db/<name>/<filename>).
 *
 * The file format follows the extension: `.json` is JSON, anything else is
 * YAML. Before this, item edits always wrote YAML, so a `.json` file ended up
 * holding YAML and the next refresh failed with
 * "No number after minus sign in JSON at position 1".
 */
import yaml from "js-yaml";
import path from "path";
import { child } from "./logger";

const log = child({ module: "local-items-file" });

export function isJsonItemsFile(filename: string): boolean {
  return path.extname(filename).toLowerCase() === ".json";
}

/** Text to write for a local items file, in the format its extension asks for. */
export function serializeLocalItems(
  data: unknown,
  filename: string,
  yamlDump: (data: unknown) => string = (d) => yaml.dump(d, { lineWidth: 120 }),
): string {
  if (isJsonItemsFile(filename)) {
    return JSON.stringify(data, null, 2) + "\n";
  }
  return yamlDump(data);
}

/**
 * Parse a `.json` items file. A file that is not valid JSON but is valid YAML
 * (written by the old YAML-only save) is still read, with a warning, so those
 * databases load again; the next save rewrites it as JSON.
 */
export function parseJsonItemsFile(content: string, label: string): unknown {
  try {
    return JSON.parse(content);
  } catch (jsonErr) {
    let data: unknown;
    try {
      data = yaml.load(content);
    } catch {
      throw jsonErr;
    }
    if (data === undefined || data === null || typeof data !== "object") {
      throw jsonErr;
    }
    log.warn(
      { file: label, error: jsonErr instanceof Error ? jsonErr.message : String(jsonErr) },
      "[local-items] .json file holds YAML; read it as YAML. Next save writes JSON.",
    );
    return data;
  }
}
