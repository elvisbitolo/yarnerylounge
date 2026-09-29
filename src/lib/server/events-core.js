const DEFAULT_CAP = 52;

function toDate(value) {
  if (!value) return new Date();
  if (typeof value.toMillis === "function") return new Date(value.toMillis());
  if (value instanceof Date) return value;
  return new Date(value);
}

export function addInterval(date, freq, interval) {
  const d = new Date(date.getTime());
  if (freq === "daily") d.setDate(d.getDate() + interval);
  else if (freq === "weekly") d.setDate(d.getDate() + 7 * interval);
  else if (freq === "monthly") d.setMonth(d.getMonth() + interval);
  return d;
}

export function expandEvent(
  event,
  until = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
) {
  const recurrence = event.recurrence;
  if (!recurrence || !recurrence.freq || Number(recurrence.count) <= 1) {
    return [{ ...event, occurrenceId: `${event.id}_0`, occurrenceIndex: 0 }];
  }

  const count = Math.min(Number(recurrence.count) || 1, DEFAULT_CAP);
  const interval = Math.max(Number(recurrence.interval) || 1, 1);
  const occurrences = [];
  const base = toDate(event.startTime);
  let cursor = new Date(base);
  for (let i = 0; i < count; i++) {
    if (cursor.getTime() > until.getTime()) break;
      // Preserve the block's own duration. Shifting only startTime left every
      // later occurrence ending on the first occurrence's end, so a 19:00-21:00
      // event repeated as 19:00-21:00 seven days later regardless of its real end.
      const duration = event.endTime
        ? new Date(event.endTime).getTime() - new Date(event.startTime).getTime()
        : null;
      occurrences.push({
        ...event,
        startTime: new Date(cursor),
        endTime: duration != null ? new Date(cursor.getTime() + duration) : event.endTime,
        occurrenceId: `${event.id}_${i}`,
        occurrenceIndex: i,
      });
    cursor = addInterval(cursor, recurrence.freq, interval);
  }
  return occurrences;
}

export function expandEvents(events) {
  const expanded = [];
  for (const event of events) {
    expanded.push(...expandEvent(event));
  }
  return expanded.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

export function applyRsvpCounts(counts, countKey, capacity, isJoining) {
  const next = { ...(counts || {}) };
  const current = Number(next[countKey]) || 0;
  if (isJoining) {
    const cap = Number(capacity) || 0;
    if (cap > 0 && current >= cap) {
      return { full: true, counts: next };
    }
    next[countKey] = current + 1;
  } else if (current > 1) {
    next[countKey] = current - 1;
  } else {
    delete next[countKey];
  }
  return { full: false, counts: next };
}
