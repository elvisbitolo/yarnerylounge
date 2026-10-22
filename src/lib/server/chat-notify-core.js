// Policy for telling the other people in a conversation that a message
// arrived. Pure functions only - no database, no environment - so the rules
// can be unit-tested directly.
//
// One DM was the only conversation that ever notified anyone: the message
// route fanned out to the single other participant and only when
// conversation.type was "dm". Group and region chats were silent - a member
// posting into a group notified nobody, in-app or otherwise. These helpers
// describe who to notify, and whether each channel should fire.

export const DM_NOTIFY_TYPE = "dm";
export const GROUP_NOTIFY_TYPE = "chat";

// The notification type to file a chat message under. "dm" keeps its own type
// (it is the one the member sees as a private message); group and region
// chats file under "chat", which is the bucket the granular "chat"
// preference controls.
export function chatNotifyType(conversationType) {
  if (conversationType === "dm") return DM_NOTIFY_TYPE;
  if (conversationType === "group" || conversationType === "region") {
    return GROUP_NOTIFY_TYPE;
  }
  return "";
}

// Everyone in the conversation except whoever wrote the message. Duplicates
// are collapsed and the sender is never their own recipient.
export function chatRecipientIds(participantIds, senderUid) {
  if (!Array.isArray(participantIds) || !senderUid) return [];
  const seen = new Set();
  const out = [];
  for (const id of participantIds) {
    if (!id || id === senderUid || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// In-app row + push. A muted conversation stays quiet, except when the
// message names the member directly - a specific ask still breaks through.
export function shouldNotifyChatRecipient({ muted = false, mentioned = false } = {}) {
  return !muted || mentioned === true;
}

// Email. Honours the member's global opt-out, their granular "chat"
// preference and the per-conversation mute, with the same mention break as
// the in-app rule.
export function shouldEmailChatRecipient({
  globalOff = false,
  chatPrefOff = false,
  muted = false,
  mentioned = false,
} = {}) {
  if (globalOff) return false;
  if (chatPrefOff) return false;
  return !muted || mentioned === true;
}

// The one-line preview used for both the notification and the email.
export function chatSnippet({ text = "", attachment = null } = {}) {
  const body = typeof text === "string" ? text.trim() : "";
  if (body) return body;
  if (attachment?.kind === "image") return "📷 Photo";
  return `📎 ${attachment?.name || "File"}`;
}
