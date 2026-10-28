const GRAPH_BASE = "https://graph.facebook.com/v21.0";

function getConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId, wabaId };
}

export function isWhatsAppConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppText({ to, body }) {
  const cfg = getConfig();
  if (!cfg) throw new Error("whatsapp_not_configured");
  const res = await fetch(`${GRAPH_BASE}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.error?.message || `whatsapp_send_failed_${res.status}`;
    throw new Error(err);
  }
  return json;
}

export async function sendWhatsAppTemplate({ to, name, languageCode = "en", components = [] }) {
  const cfg = getConfig();
  if (!cfg) throw new Error("whatsapp_not_configured");
  const res = await fetch(`${GRAPH_BASE}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: languageCode },
        components,
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = json?.error?.message || `whatsapp_template_failed_${res.status}`;
    throw new Error(err);
  }
  return json;
}

export async function getPhoneNumberInfo() {
  const cfg = getConfig();
  if (!cfg) throw new Error("whatsapp_not_configured");
  const res = await fetch(`${GRAPH_BASE}/${cfg.phoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || "whatsapp_info_failed");
  return json;
}
