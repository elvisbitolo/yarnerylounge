// Who may rearrange the /members constellation.
//
// Kept apart from the geometry in src/lib/members-layout-core.js because this
// is the half that reads the environment, and that module has to stay safe to
// import from a client component.
//
// Same reasoning as lounge-live-core.js for an exact email match rather than
// `role = "owner"`: the owner named the two accounts that should curate the
// board, and role is a poor proxy for "the people who want this".

export {
  LAYOUT_PIN_KEY,
  sanitizePin,
  pinFromVirtual,
  pinFor,
} from "../members-layout-core.js";

// CSV so it can be overridden per environment without a deploy. Emails are
// lowercased and trimmed on parse, and again on compare, so `Owner@X` and
// `owner@X` are the same editor.
export const LAYOUT_EDITOR_EMAILS = (
  process.env.MEMBERS_LAYOUT_EDITORS ||
  "secretyarnery@gmail.com,elvisbitolo11@gmail.com"
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

/** Whether this account may drag members around on /members. */
export function isLayoutEditor(user) {
  if (!user) return false;
  const email = String(user.email || "").trim().toLowerCase();
  // Boolean(email) first, so a stray empty entry in the env var can never
  // match an account with no email attached.
  return Boolean(email) && LAYOUT_EDITOR_EMAILS.includes(email);
}
