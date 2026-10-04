// Pure validation for admin-editable content. No database or framework imports,
// so it can be unit tested directly (same convention as the other *-core.js modules).

/**
 * Admin-editable text fields, per model.
 *
 * This is an explicit ALLOW LIST. A PATCH body may only set the fields listed
 * here, so a crafted request cannot write columns the UI never exposes
 * (ids, createdBy, owner ids, status flags on unrelated models).
 *
 * type: string | text | boolean | stringArray
 *   string      - single-line input
 *   text        - multi-line textarea (markdown-lite)
 *   boolean     - true/false
 *   stringArray - Postgres text[]; accepts an array or a comma-separated string
 *   max         - character cap enforced server-side (per item for stringArray)
 */
export { EDITABLE_FIELDS } from "../admin/content-fields.js";
import { EDITABLE_FIELDS } from "../admin/content-fields.js";

export function isEditableKind(kind) {
  return Object.hasOwn(EDITABLE_FIELDS, kind);
}

/**
 * Reduce an incoming PATCH body to only the allow-listed fields, validated.
 * Returns { data, errors }. Never throws for bad input.
 */
export function sanitizePatch(kind, body) {
  // Own-property check: EDITABLE_FIELDS["__proto__"] is Object.prototype, which
  // is truthy, so a truthiness check would pass and then crash on spec.fields.
  const spec = Object.hasOwn(EDITABLE_FIELDS, kind) ? EDITABLE_FIELDS[kind] : null;
  if (!spec) return { data: null, errors: ["Unknown content type"] };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { data: null, errors: ["Body must be an object"] };
  }

  const data = {};
  const errors = [];

  for (const [key, rule] of Object.entries(spec.fields)) {
    if (!Object.hasOwn(body, key)) continue;
    const raw = body[key];

    if (rule.type === "boolean") {
      if (typeof raw !== "boolean") errors.push(`${key} must be true or false`);
      else data[key] = raw;
      continue;
    }

    if (rule.type === "stringArray") {
      // Prisma String[] columns reject a bare string, so normalise here rather
      // than letting the write fail deep in the query layer.
      const list = Array.isArray(raw)
        ? raw
        : typeof raw === "string"
          ? raw.split(",")
          : null;
      if (!list) {
        errors.push(`${key} must be a list`);
        continue;
      }
      const cleaned = [];
      for (const item of list) {
        if (typeof item !== "string") {
          errors.push(`${key} must be a list of text`);
          break;
        }
        const value = item.trim();
        if (value.length > rule.max) {
          errors.push(`${key} entries must be ${rule.max} characters or fewer`);
          break;
        }
        if (value && !cleaned.includes(value)) cleaned.push(value);
      }
      if (!errors.length) data[key] = cleaned.slice(0, rule.items || 20);
      continue;
    }

    if (raw === null) {
      data[key] = "";
      continue;
    }
    if (typeof raw !== "string") {
      errors.push(`${key} must be text`);
      continue;
    }

    const value = raw.trim();
    if (rule.required && !value) {
      errors.push(`${key} is required`);
      continue;
    }
    if (value.length > rule.max) {
      errors.push(`${key} must be ${rule.max} characters or fewer`);
      continue;
    }
    data[key] = value;
  }

  if (!Object.keys(data).length && !errors.length) {
    errors.push("Nothing to update");
  }
  return { data, errors };
}
