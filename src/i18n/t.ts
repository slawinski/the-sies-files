// Typed localization boundary (audit spec 23 §6). Keys are derived from the
// dictionary shape — typos fail at compile time. Interpolation uses `{name}`
// tokens; never dynamic string-key access from untrusted data.

import { pl } from "./pl";

type LeafPaths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : LeafPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = LeafPaths<typeof pl>;

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let value: unknown = pl;
  for (const part of key.split(".")) {
    value = (value as Record<string, unknown>)[part];
  }
  let text = String(value);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}
