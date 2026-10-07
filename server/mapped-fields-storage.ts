import { getContentTypeConfig } from "./content-types";

/**
 * Where an entry file stores mapped field values: root keys (the file is the entry's data)
 * or the `field_overrides` bag (the data comes from a source item and the file overrides it).
 */
export type MappedFieldsStorage = "root_key" | "field_overrides";

export function mappedFieldsStorageFor(contentType: string, contentRoot?: string): MappedFieldsStorage {
  return getContentTypeConfig(contentType, contentRoot)?.database?.slug ? "field_overrides" : "root_key";
}
