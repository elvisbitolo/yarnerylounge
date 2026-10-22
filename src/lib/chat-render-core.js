// Tokenizer for chat message markup (bold, italic, links, @mentions, #tags).
//
// Kept free of React/CSS imports so it can be unit-tested directly. The
// renderer in chat-render.js turns these tokens into React elements; because
// React escapes text children itself, this module must NOT HTML-escape the
// text. Doing that here used to turn "it's" into "&#39;", which React then
// displayed literally — and the "#" inside the entity was even parsed as a
// hashtag, splitting the word into "it&" + a #39 chip + ";s".

const BOLD = /^\*\*(.+?)\*\*/;
const ITALIC = /^\*(.+?)\*/;
const LINK = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const MENTION = /^@([a-zA-Z0-9_.]{1,30})/;
const TAG = /^#([a-zA-Z0-9_-]{1,30})/;

// Characters that can make up the local part of an email address. An "@"
// preceded by one of these belongs to an address ("hookingup@gmail.com"), not
// a mention ("@christa_lynn").
const EMAIL_LOCAL_CHAR = /[A-Za-z0-9_.+-]/;

export function tokenizeChatText(text) {
  if (!text || typeof text !== "string") return [];

  const tokens = [];
  let remaining = text;

  while (remaining.length > 0) {
    // `remaining` is always a suffix of `text`, so this is the index of the
    // next character we're about to consume.
    const offset = text.length - remaining.length;
    const prev = offset > 0 ? text[offset - 1] : "";

    const bold = remaining.match(BOLD);
    const italic = bold ? null : remaining.match(ITALIC);
    const link = bold || italic ? null : remaining.match(LINK);
    const mention =
      bold || italic || link || (prev && EMAIL_LOCAL_CHAR.test(prev))
        ? null
        : remaining.match(MENTION);
    const tag = bold || italic || link || mention ? null : remaining.match(TAG);

    if (bold) {
      tokens.push({ type: "bold", value: bold[1] });
      remaining = remaining.slice(bold[0].length);
    } else if (italic) {
      tokens.push({ type: "italic", value: italic[1] });
      remaining = remaining.slice(italic[0].length);
    } else if (link) {
      tokens.push({ type: "link", label: link[1], href: link[2] });
      remaining = remaining.slice(link[0].length);
    } else if (mention) {
      tokens.push({ type: "mention", value: mention[0], name: mention[1] });
      remaining = remaining.slice(mention[0].length);
    } else if (tag) {
      tokens.push({ type: "tag", value: tag[0], name: tag[1] });
      remaining = remaining.slice(tag[0].length);
    } else {
      const nextMarker = remaining.search(/\*|(\[)|@|#/);
      if (nextMarker === -1) {
        tokens.push({ type: "text", value: remaining });
        break;
      }
      if (nextMarker === 0) {
        tokens.push({ type: "text", value: remaining.charAt(0) });
        remaining = remaining.slice(1);
      } else {
        tokens.push({ type: "text", value: remaining.slice(0, nextMarker) });
        remaining = remaining.slice(nextMarker);
      }
    }
  }

  return tokens;
}
