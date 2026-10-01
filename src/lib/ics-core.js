// Minimal iCalendar (RFC 5545) builder for the calendar's "Add to calendar"
// action. Only the fields a member needs to drop one event into the calendar
// app they already use are emitted; we do not attempt to model recurrence.

function pad(value) {
  return String(value).padStart(2, "0");
}

// Every timestamp in an .ics must be UTC ("Z") or a floating local time. We
// store instants, so UTC is the unambiguous choice.
export function toIcsStamp(instant) {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return "";
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// RFC 5545 3.3.11: backslash, semicolon, comma and newlines are special and
// must be escaped inside TEXT values.
export function escapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// Long property lines are folded at 75 octets with a leading space on the
// continuation line, otherwise some calendar clients silently truncate them.
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) {
    parts.push(` ${line.slice(i, i + 74)}`);
  }
  return parts.join("\r\n");
}

function eventUid(id) {
  return `${escapeIcsText(id || "event")}@secretyarnery`;
}

export function buildEventIcs({
  id,
  title,
  description,
  startTime,
  endTime,
  roomName,
  url,
  now,
} = {}) {
  const start = toIcsStamp(startTime);
  if (!start) return "";
  const end = toIcsStamp(endTime) || start;
  const stamp = toIcsStamp(now || new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Secret Yarnery//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${eventUid(id)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (roomName) lines.push(`LOCATION:${escapeIcsText(roomName)}`);
  if (url) lines.push(`URL:${escapeIcsText(url)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function icsFilename(title) {
  const base = String(title || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "event"}.ics`;
}
