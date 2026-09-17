import * as fs from "fs";
import { getDefaultContentRoot } from "./site-config";
import * as path from "path";
import * as yaml from "js-yaml";
import { LLMService, resolveVisionModel } from "./ai/LLMService";
import { escapeTemplateVars } from "../shared/templateVars";
import { mediaGallery } from "./media-gallery";
import { getAllDirectories } from "./content-types";
import { child } from "./logger";
const log = child({ module: "image-auto-tagger" });



const MARKETING_CONTENT_DIR = getDefaultContentRoot();

const CONTENT_DIRS = getAllDirectories().map(dir => path.join(MARKETING_CONTENT_DIR, dir));

interface TagDefinition {
  label: string;
  description: string;
  presets: string[];
  srcset_widths: number[];
  detection: {
    yaml_fields?: string[];
    component_keys?: string[];
    filename_patterns?: string[];
    aspect_ratio_range?: { min: number; max: number };
  };
}

interface ImageEntry {
  src: string;
  alt?: string;
  tags?: string[];
  width?: number;
  height?: number;
  preset?: string[];
  focal_point?: string;
  hash?: string;
  usage_count?: number;
  [key: string]: unknown;
}

interface RegistryWithTagDefs {
  presets: Record<string, unknown>;
  tagDefinitions?: Record<string, TagDefinition>;
  images: Record<string, ImageEntry>;
}

function getRegistryFromGallery(): RegistryWithTagDefs {
  const registry = mediaGallery.getRegistry();
  if (!registry) {
    throw new Error("Failed to load image registry via MediaGallery");
  }
  return registry as unknown as RegistryWithTagDefs;
}

function getVisionModel(): string {
  return resolveVisionModel();
}

function getAllYamlFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
        files.push(full);
    }
  }
  walk(dir);
  return files;
}

let yamlContextCache: {
  srcToComponentKeys: Map<string, Set<string>>;
  srcToYamlFields: Map<string, Set<string>>;
} | null = null;

function buildYamlContext(): {
  srcToComponentKeys: Map<string, Set<string>>;
  srcToYamlFields: Map<string, Set<string>>;
} {
  if (yamlContextCache) return yamlContextCache;

  const srcToComponentKeys = new Map<string, Set<string>>();
  const srcToYamlFields = new Map<string, Set<string>>();

  for (const dir of CONTENT_DIRS) {
    for (const file of getAllYamlFiles(dir)) {
      try {
        const raw = fs.readFileSync(file, "utf-8");
        const { escaped } = escapeTemplateVars(raw);
        const parsed = yaml.load(escaped);
        if (parsed && typeof parsed === "object") {
          extractImageContextFromYaml(
            parsed as Record<string, unknown>,
            "",
            srcToComponentKeys,
            srcToYamlFields,
          );
        }
      } catch {}
    }
  }

  yamlContextCache = { srcToComponentKeys, srcToYamlFields };
  return yamlContextCache;
}

function extractImageContextFromYaml(
  obj: unknown,
  fieldPath: string,
  srcToComponentKeys: Map<string, Set<string>>,
  srcToYamlFields: Map<string, Set<string>>,
): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      extractImageContextFromYaml(
        obj[i],
        `${fieldPath}[${i}]`,
        srcToComponentKeys,
        srcToYamlFields,
      );
    }
    return;
  }

  const record = obj as Record<string, unknown>;

  const componentType =
    typeof record.type === "string" ? record.type : undefined;
  const sectionKey = Object.keys(record).find(
    (k) =>
      k.startsWith("hero") ||
      k.startsWith("testimonial") ||
      k.startsWith("partner") ||
      k.startsWith("team") ||
      k.startsWith("award") ||
      k.startsWith("press") ||
      k.startsWith("badge"),
  );

  for (const [key, value] of Object.entries(record)) {
    const currentPath = fieldPath ? `${fieldPath}.${key}` : key;

    if (typeof value === "string" && looksLikeImageSrc(value)) {
      addToSetMap(srcToYamlFields, value, currentPath);
      if (componentType)
        addToSetMap(srcToComponentKeys, value, componentType);
      if (sectionKey) addToSetMap(srcToComponentKeys, value, sectionKey);
    } else if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "src" in (value as Record<string, unknown>)
    ) {
      const src = (value as Record<string, unknown>).src;
      if (typeof src === "string" && looksLikeImageSrc(src)) {
        addToSetMap(srcToYamlFields, src, currentPath);
        if (componentType)
          addToSetMap(srcToComponentKeys, src, componentType);
        if (sectionKey) addToSetMap(srcToComponentKeys, src, sectionKey);
      }
    }

    extractImageContextFromYaml(
      value,
      currentPath,
      srcToComponentKeys,
      srcToYamlFields,
    );
  }
}

function looksLikeImageSrc(s: string): boolean {
  return (
    s.startsWith("https://") ||
    s.startsWith("http://") ||
    /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(s)
  );
}

function addToSetMap(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

function heuristicClassify(
  imageId: string,
  entry: ImageEntry,
  tagDefs: Record<string, TagDefinition>,
  context?: { tagFilter?: string },
): string[] {
  const tags: Set<string> = new Set();
  const filename = imageId.toLowerCase();
  const alt = (entry.alt || "").toLowerCase();
  const aspectRatio =
    entry.width && entry.height ? entry.width / entry.height : null;

  const yamlCtx = buildYamlContext();
  const imageComponentKeys = yamlCtx.srcToComponentKeys.get(entry.src) || new Set();
  const imageYamlFields = yamlCtx.srcToYamlFields.get(entry.src) || new Set();

  for (const [tagName, def] of Object.entries(tagDefs)) {
    const det = def.detection;
    if (!det) continue;

    if (det.filename_patterns) {
      for (const pattern of det.filename_patterns) {
        if (
          filename.includes(pattern.toLowerCase()) ||
          alt.includes(pattern.toLowerCase())
        ) {
          tags.add(tagName);
          break;
        }
      }
    }

    if (det.component_keys) {
      for (const compKey of det.component_keys) {
        if (imageComponentKeys.has(compKey)) {
          tags.add(tagName);
          break;
        }
      }
    }

    if (det.yaml_fields) {
      for (const yamlField of det.yaml_fields) {
        const fieldLower = yamlField.toLowerCase();
        for (const actualField of imageYamlFields) {
          if (actualField.toLowerCase().includes(fieldLower)) {
            tags.add(tagName);
            break;
          }
        }
        if (tags.has(tagName)) break;
      }
    }

    if (
      !tags.has(tagName) &&
      aspectRatio !== null &&
      det.aspect_ratio_range &&
      aspectRatio >= det.aspect_ratio_range.min &&
      aspectRatio <= det.aspect_ratio_range.max
    ) {
      const hasOtherEvidence =
        imageComponentKeys.size > 0 || imageYamlFields.size > 0;
      if (hasOtherEvidence) {
        tags.add(tagName);
      }
    }
  }

  if (context?.tagFilter && tagDefs[context.tagFilter]) {
    tags.add(context.tagFilter);
  }

  return Array.from(tags);
}

async function aiClassify(
  imageId: string,
  entry: ImageEntry,
  canonicalTags: Record<string, TagDefinition>,
  heuristicTags: string[],
  context?: { tagFilter?: string },
): Promise<string[]> {
  try {
    const llm = LLMService.getInstance();
    const visionModel = getVisionModel();

    const tagList = Object.entries(canonicalTags)
      .map(([name, def]) => `- ${name}: ${def.description}`)
      .join("\n");

    const systemPrompt = `You are an image classification assistant. Classify the provided image using ONLY these canonical tags:\n${tagList}\n\nReturn a JSON object with a single key "tags" containing an array of applicable tag strings. Only use tags from the list above. Be conservative — only assign tags that clearly apply.`;

    const metadata: string[] = [
      `Image ID: ${imageId}`,
      `Alt text: ${entry.alt || "(none)"}`,
    ];
    if (entry.width && entry.height) {
      metadata.push(
        `Dimensions: ${entry.width}x${entry.height} (aspect ratio: ${(entry.width / entry.height).toFixed(2)})`,
      );
    }
    if (heuristicTags.length > 0) {
      metadata.push(`Heuristic tags (hints): ${heuristicTags.join(", ")}`);
    }
    if (context?.tagFilter) {
      metadata.push(
        `Context hint: this image was selected for a "${context.tagFilter}" field`,
      );
    }

    const textPrompt = `Classify this image based on its visual content and metadata:\n${metadata.join("\n")}\n\nReturn JSON: {"tags": ["tag1", "tag2"]}`;

    const isPublicUrl =
      entry.src.startsWith("https://") || entry.src.startsWith("http://");

    let result: string;
    if (isPublicUrl) {
      result = await llm.completeWithVision(textPrompt, [entry.src], {
        model: visionModel,
        systemPrompt,
        temperature: 0.2,
        maxTokens: 200,
      });
    } else {
      result = await llm.complete(
        `${textPrompt}\n\nNote: The image is not available for visual inspection. Classify based on metadata only.`,
        {
          model: visionModel,
          systemPrompt,
          temperature: 0.2,
          maxTokens: 200,
        },
      );
    }

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.tags)) {
        return parsed.tags.filter(
          (t: unknown) => typeof t === "string" && t in canonicalTags,
        );
      }
    }
  } catch (err) {
    log.warn(
      { err, imageId },
      `[ImageAutoTagger] AI classification failed for ${imageId}`,
    );
  }
  return [];
}

export async function classifyImage(
  imageId: string,
  entry: ImageEntry,
  context?: { tagFilter?: string },
): Promise<string[]> {
  const registry = getRegistryFromGallery();
  const tagDefs = registry.tagDefinitions;

  if (!tagDefs || Object.keys(tagDefs).length === 0) {
    return [];
  }

  const heuristicTags = heuristicClassify(imageId, entry, tagDefs, context);

  let aiTags: string[] = [];
  try {
    aiTags = await aiClassify(imageId, entry, tagDefs, heuristicTags, context);
  } catch {
    // AI classification is best-effort
  }

  const merged = new Set([...heuristicTags, ...aiTags]);
  return Array.from(merged);
}

export function applyTagsToRegistry(
  imageId: string,
  newTags: string[],
): { applied: string[]; existing: string[] } {
  const registry = getRegistryFromGallery();
  const entry = registry.images[imageId];
  if (!entry) {
    throw new Error(`Image "${imageId}" not found in registry`);
  }

  const existingTags = new Set(entry.tags || []);
  const applied: string[] = [];

  for (const tag of newTags) {
    if (!existingTags.has(tag)) {
      applied.push(tag);
      existingTags.add(tag);
    }
  }

  if (applied.length > 0) {
    entry.tags = Array.from(existingTags);
    mediaGallery.persistRegistry();
  }

  return {
    applied,
    existing: Array.from(existingTags),
  };
}

export async function classifyAndApply(
  imageId: string,
  context?: { tagFilter?: string },
  persist: boolean = true,
): Promise<{ imageId: string; tags: string[]; added: string[] }> {
  const registry = getRegistryFromGallery();
  const entry = registry.images[imageId];
  if (!entry) {
    throw new Error(`Image "${imageId}" not found in registry`);
  }

  const tags = await classifyImage(imageId, entry, context);

  if (tags.length === 0) {
    return { imageId, tags: entry.tags || [], added: [] };
  }

  if (!persist) {
    const existingTags = new Set(entry.tags || []);
    const added = tags.filter((t) => !existingTags.has(t));
    return { imageId, tags: [...(entry.tags || []), ...added], added };
  }

  const { applied, existing } = applyTagsToRegistry(imageId, tags);
  return { imageId, tags: existing, added: applied };
}

export function clearYamlContextCache(): void {
  yamlContextCache = null;
}
