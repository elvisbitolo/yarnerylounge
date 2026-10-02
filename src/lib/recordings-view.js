// Remembered library view preferences (sort + grid/list).
//
// Backed by localStorage through `useSyncExternalStore` so the client can read
// the saved value without a mount effect that setStates during render, and
// without a server/client hydration mismatch (the server always gets defaults).

const STORAGE_KEY = "yarnery-recordings-view";

export const RECORDINGS_VIEW_DEFAULTS = Object.freeze({
  sort: "newest",
  view: "grid",
  chip: "all",
});

let cache = null;
const listeners = new Set();

function read() {
  if (cache) return cache;
  let parsed = RECORDINGS_VIEW_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = { ...RECORDINGS_VIEW_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    parsed = RECORDINGS_VIEW_DEFAULTS;
  }
  cache = parsed;
  return cache;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return read();
}

export function getServerSnapshot() {
  return RECORDINGS_VIEW_DEFAULTS;
}

export function updateRecordingView(patch) {
  cache = { ...read(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* private mode / quota: remembering the view is a convenience */
  }
  for (const listener of listeners) listener();
}
