const GRAPH_BASE = "https://graph.facebook.com";
const GRAPH_VERSION = (process.env.WHATSAPP_GRAPH_API_VERSION || "v26.0").replace(/^\/?/, "");

function getConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId, wabaId };
}

function endpoint(path) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${path}`;
}

async function parseResponse(res, fallback) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Keep credentials out of errors and logs; Meta's error message is useful
    // for diagnosing permissions, template and phone-number configuration.
    throw new Error(json?.error?.message || `${fallback}_${res.status}`);
  }
  return json;
}

export function isWhatsAppConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppText({ to, body }) {
  const cfg = getConfig();
  if (!cfg) throw new Error("whatsapp_not_configured");
  if (!/^\d{8,15}$/.test(String(to || ""))) throw new Error("whatsapp_invalid_recipient");
  if (!String(body || "").trim()) throw new Error("whatsapp_empty_message");

  const res = await fetch(endpoint(`${cfg.phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: String(to),
      type: "text",
      text: { body: String(body).slice(0, 4096) },
    }),
  });
  return parseResponse(res, "whatsapp_send_failed");
}

export async function sendWhatsAppTemplate({ to, name, languageCode = "en", components = [] }) {
  const cfg = getConfig();
  if (!cfg) throw new Error("whatsapp_not_configured");
  if (!/^\d{8,15}$/.test(String(to || ""))) throw new Error("whatsapp_invalid_recipient");
  if (!/^[a-zA-Z0-9_]+$/.test(String(name || ""))) throw new Error("whatsapp_invalid_template_name");

  const res = await fetch(endpoint(`${cfg.phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: String(to),
      type: "template",
      template: { name, language: { code: languageCode }, components },
    }),
  });
  return parseResponse(res, "whatsapp_template_failed");
}

export async function getPhoneNumberInfo() {
  const cfg = getConfig();
  if (!cfg) throw new Error("whatsapp_not_configured");
  const fields = "verified_name,code_verification_status,display_phone_number,quality_rating";
  const res = await fetch(endpoint(`${cfg.phoneNumberId}?fields=${fields}`), {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  return parseResponse(res, "whatsapp_info_failed");
}
