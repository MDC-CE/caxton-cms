import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

interface ContentTypeEntry {
  directory: string;
  url_pattern: Record<string, string>;
}

export interface ContentTypeApiItem {
  name: string;
  label: string;
  directory: string;
  url_pattern: Record<string, string>;
  has_database: boolean;
  database_slug: string | null;
  single_template: boolean;
  has_field_mapping: boolean;
  unique_fields: string[];
  field_mapping_keys: string[];
  static_entry_count: number;
  database_entry_count?: number | null;
}

type ContentTypesMap = Record<string, ContentTypeEntry>;

export function useContentTypesRaw() {
  return useQuery<ContentTypeApiItem[]>({
    queryKey: ["/api/content-types"],
    staleTime: Infinity,
  });
}

export function useContentTypes() {
  const { data } = useContentTypesRaw();

  return useMemo(() => {
    if (!data) return null;
    const map: ContentTypesMap = {};
    for (const item of data) {
      map[item.name] = {
        directory: item.directory,
        url_pattern: item.url_pattern,
      };
    }
    return map;
  }, [data]);
}

export function getTypeFromFolder(configs: ContentTypesMap, folder: string): string {
  for (const [type, config] of Object.entries(configs)) {
    if (config.directory === folder) return type;
  }
  return folder;
}

export function getFolderFromType(configs: ContentTypesMap, type: string): string {
  const config = configs[type];
  if (config) return config.directory;
  for (const [t, c] of Object.entries(configs)) {
    if (c.directory === type) return type;
  }
  return type;
}

export function getContentTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function getAllContentTypes(configs: ContentTypesMap): string[] {
  return Object.keys(configs);
}

const PLURAL_TO_SINGULAR: Record<string, string> = {
  programs: "program",
  landings: "landing",
  locations: "location",
  pages: "page",
};

export function normalizeContentType(typeOrFolder: string, configs?: ContentTypesMap | null): string {
  if (PLURAL_TO_SINGULAR[typeOrFolder]) return PLURAL_TO_SINGULAR[typeOrFolder];
  if (configs && configs[typeOrFolder]) return typeOrFolder;
  if (configs) {
    for (const [type, config] of Object.entries(configs)) {
      if (config.directory === typeOrFolder) return type;
    }
  }
  return typeOrFolder;
}
