import { logError } from "@/lib/server/log";

const BRAND = "Christa's Speakeasy";
const COMMUNITY_URL = "https://www.christasspeakeasy.com/chat";
const ACCENT = "#f6077a";
const INK = "#171717";
const MUTED = "#777777";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function renderPlainText(text = "") {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.7;color:#333333;font-size:15px;">${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function normalizeEmailBody(html = "") {
  const source = String(html).trim();
  if (!source) return "";
  // Existing callers may pass a complete HTML document. Extract its body so
  // we never nest one document inside another email document.
  const bodyMatch = source.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1];
  return source
    .replace(/<!doctype[^>]*>/ig, "")
    .replace(/<html\b[^>]*>|<\/html>/ig, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/ig, "")
    .replace(/<meta\b[^>]*>/ig, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/ig, "");
}

/**
 * Wrap every outgoing email in a responsive, email-client-safe branded layout.
 * Inline styles are intentional for compatibility with Gmail and Outlook.
 */
export function renderBrandedEmail({ subject, text = "", html = "" }) {
  const safeSubject = escapeHtml(subject || BRAND);
  const preheader = escapeHtml(String(text || "").replace(/\s+/g, " ").trim().slice(0, 180));
  const body = normalizeEmailBody(html) || renderPlainText(text);
  const year = new Date().getFullYear();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#f3f1f2;font-family:Arial,Helvetica,sans-serif;color:${INK};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f1f2;width:100%;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="height:6px;background:${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 30px 22px;background:${INK};">
          <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-.3px;">Secret Yarnery</p>
          <p style="margin:7px 0 0;color:#e9dfe5;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;">Christa's Speakeasy community</p>
        </td></tr>
        <tr><td style="padding:30px 30px 18px;">
          <h1 style="margin:0 0 22px;color:${INK};font-size:23px;line-height:1.3;font-weight:700;">${safeSubject}</h1>
          <div style="font-size:15px;line-height:1.7;color:#333333;">${body}</div>
        </td></tr>
        <tr><td style="padding:8px 30px 30px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-radius:8px;background:${ACCENT};">
            <a href="${COMMUNITY_URL}" style="display:inline-block;padding:13px 20px;border-radius:8px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Open the community chat</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:22px 30px;background:#f8f6f7;border-top:1px solid #eee8eb;">
          <p style="margin:0 0 8px;color:#555555;font-size:12px;line-height:1.6;">You're receiving this email because of activity or notifications associated with your ${BRAND} account.</p>
          <p style="margin:0;color:${MUTED};font-size:12px;line-height:1.6;">Manage your notification preferences in your account.</p>
          <p style="margin:14px 0 0;color:#999999;font-size:11px;">© ${year} ${BRAND}</p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;color:#999999;font-size:11px;line-height:1.5;text-align:center;">This is an automated notification from ${BRAND}.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendEmail({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logError("email.not_configured", { to });
    return { skipped: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "Secret Yarnery <no-reply@christa-patel.com>",
      to,
      subject,
      text: text || "",
      html: renderBrandedEmail({ subject, text, html }),
    }),
  });

  if (!res.ok) {
    throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
  }
  return { ok: true };
}
