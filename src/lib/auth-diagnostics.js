const MAX_URL = 300;
const MAX_TEXT = 300;
const DIAGNOSTIC_TTL_MS = 120_000;

let installed = false;
let lastFailure = null;
let lastCspViolation = null;

function cleanText(value, max = MAX_TEXT) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sanitizeUrl(value) {
  const text = cleanText(value, MAX_URL);
  if (!text) return null;
  try {
    const url = new URL(text, typeof window !== "undefined" ? window.location.href : undefined);
    return `${url.origin}${url.pathname}`.slice(0, MAX_URL);
  } catch {
    return text.split(/[?#]/)[0] || null;
  }
}

function classifyFailure({ status, error, csp, online }) {
  const message = String(error?.message || "").toLowerCase();
  if (csp) return "csp_blocked";
  if (online === false) return "offline";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "service_error";
  if (error?.name === "AbortError" || /aborted|cancelled|canceled/.test(message)) return "aborted";
  if (status === 0 || /failed to fetch|networkerror|network request failed|load failed|timeout|timed out/.test(message)) {
    return "network_error";
  }
  return "unknown";
}

export function installAuthDiagnostics() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  window.addEventListener(
    "securitypolicyviolation",
    (event) => {
      lastCspViolation = {
        directive: cleanText(event.effectiveDirective || event.violatedDirective || "csp", 100),
        blockedUri: sanitizeUrl(event.blockedURI),
        sourceFile: sanitizeUrl(event.sourceFile),
        at: Date.now(),
      };
    },
    true
  );
}

export function recordFetchFailure({ url, method, status, statusText, error, phase } = {}) {
  installAuthDiagnostics();
  const numericStatus = Number.isFinite(Number(status)) ? Number(status) : null;
  const normalizedError = error
    ? { name: cleanText(error.name || "Error", 80), message: cleanText(error.message, MAX_TEXT) }
    : null;
  const online = typeof navigator !== "undefined" ? navigator.onLine : null;
  lastFailure = {
    url: sanitizeUrl(url),
    method: cleanText(method || "GET", 12),
    status: numericStatus,
    statusText: cleanText(statusText, 100),
    error: normalizedError,
    phase: cleanText(phase, 40),
    failureType: classifyFailure({ status: numericStatus, error: normalizedError, csp: lastCspViolation, online }),
    at: Date.now(),
  };
  return lastFailure;
}

export function clearFetchFailure() {
  lastFailure = null;
}

export function getAuthDiagnostics() {
  const now = Date.now();
  return {
    failure: lastFailure && now - lastFailure.at < DIAGNOSTIC_TTL_MS ? { ...lastFailure } : null,
    csp: lastCspViolation && now - lastCspViolation.at < DIAGNOSTIC_TTL_MS ? { ...lastCspViolation } : null,
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
  };
}

export function resetAuthDiagnostics() {
  lastFailure = null;
  lastCspViolation = null;
}

export function memberFacingAuthMessage(error, { action = "login" } = {}) {
  const diagnostics = getAuthDiagnostics();
  const failure = diagnostics.failure;
  const csp = diagnostics.csp;
  const rawMessage = String(error?.message || failure?.error?.message || "").trim();
  const code = String(error?.code || "").toLowerCase();
  const status = failure?.status ?? error?.status ?? null;
  const label = action === "signup" ? "registration" : "sign-in";

  if (csp) {
    const detail = csp.blockedUri ? ` → ${csp.blockedUri}` : "";
    return `Your browser blocked the ${label} request (${csp.directive}${detail}). Disable ad/script blockers or try another browser, then try again.`;
  }

  if (diagnostics.online === false) {
    return `You appear to be offline. Reconnect to the internet and try ${label} again.`;
  }

  if (status === 429) {
    return "Too many attempts right now. Please wait a few minutes and try again.";
  }

  if (status >= 500) {
    return `The account service is temporarily unavailable${status ? ` (HTTP ${status})` : ""}. Please try again in a few minutes.`;
  }

  if (failure?.failureType === "aborted") {
    return "The request was cancelled before it finished. Keep this page open and try again.";
  }

  const networkish =
    !code ||
    /failed to fetch|network|timeout|timed out|load failed/i.test(rawMessage) ||
    (!code && failure?.failureType === "network_error");

  if (networkish) {
    const target = failure?.url ? ` at ${failure.url}` : "";
    return `We couldn't reach the account service during ${label}${target}. Check your connection, disable VPN/ad blockers, or try again shortly.`;
  }

  return rawMessage || "Authentication was unsuccessful.";
}
