// Starred-message helpers. "Stars" are a viewer-local bookmark, kept in the
// same user.extra JSON bag as the other chat prefs — a conversational key of
// message id -> starred-at timestamp, e.g.:
//
//   extra.starredMessages[conversationId][messageId] = 1690000000000
//
// They never touch the message row itself, so anyone can star anything without
// changing the conversation for everyone else.

const extraOf = (extra) => (extra && typeof extra === "object" ? extra : {});

const starredMessagesOf = (extra) => {
  const box = extraOf(extra).starredMessages;
  return box && typeof box === "object" ? box : {};
};

export function readStarredMessages(extra, conversationId) {
  const perConv = starredMessagesOf(extra)[conversationId];
  return perConv && typeof perConv === "object" ? perConv : {};
}

export function starredMessageIds(extra, conversationId) {
  return Object.keys(readStarredMessages(extra, conversationId));
}

export function isMessageStarred(extra, conversationId, messageId) {
  return Object.prototype.hasOwnProperty.call(
    readStarredMessages(extra, conversationId),
    messageId
  );
}

// Returns a new `extra` object with the star toggled for one message. Keeps
// every other conversation's stars (and all sibling extra keys) intact.
export function toggleStarInExtra(extra, conversationId, messageId, starred, now = Date.now()) {
  const base = extraOf(extra);
  const box = starredMessagesOf(base);
  const current = readStarredMessages(base, conversationId);
  const next = { ...current };
  if (starred) next[messageId] = now;
  else delete next[messageId];
  return { ...base, starredMessages: { ...box, [conversationId]: next } };
}