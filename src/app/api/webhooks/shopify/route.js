import { NextResponse } from "next/server";
import crypto from "crypto";
import { adminDb } from "@/lib/firebase/admin";
import {
  mapShopifyLineItems,
  computeExpiresAt,
  buildSubscriptionDoc,
} from "@/lib/server/shopify";
import { sendEmail } from "@/lib/server/email";
import { logError } from "@/lib/server/log";

function verifyHmac(rawBody, header) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    logError("shopify.webhook_secret_missing");
    return false;
  }
  if (!header) return false;
  try {
    const digest = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("base64");
    const a = Buffer.from(digest);
    const b = Buffer.from(header);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function findUserByEmail(users, email) {
  const snap = await users.where("email", "==", email).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

// Grants (or refreshes) paid access. Registered members get an in-place
// upgrade; unregistered buyers get a pre-paid record merged at signup.
async function grantAccess({ data, email, order }) {
  const users = adminDb().collection("users");
  const variant = mapShopifyLineItems(order.line_items || []);
  const expiresAt = computeExpiresAt(variant)?.toISOString() || "";
  const customerId = order.customer?.id?.toString() || "";
  const orderId = order.id?.toString() || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const existing = await findUserByEmail(users, email);
  if (existing) {
    const uid = existing.id;
    await existing.ref.update({
      plan: variant.plan,
      role: variant.role,
      paymentStatus: "paid",
      isPrePaid: false,
      shopifyCustomerId: customerId,
      shopifyOrderId: orderId,
      expiresAt,
      updatedAt: new Date(),
    });
    await adminDb()
      .collection("subscriptions")
      .doc(uid)
      .set(
        buildSubscriptionDoc({
          variant,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          customerId,
          orderId,
        }),
        { merge: true }
      );

    await sendEmail({
      to: email,
      subject: "Your Speakeasy Membership is Active!",
      html:
        `<p>Hi ${existing.data()?.name || email},</p>` +
        `<p>Your payment for the <strong>${variant.label}</strong> plan was successful. Your membership is now active.</p>` +
        `<p>Enter the lounge to start matching, hopping into video rooms, and crafting together: ` +
        `<a href="${appUrl}/login">Enter the Lounge</a></p>` +
        `<p>— The Secret Yarnery Team</p>`,
    }).catch((err) => {
      logError("shopify.email_upgrade_failed", { email, error: err.message });
    });

    if (variant.plan !== "flirting") {
      const { createWelcomeMessage } = await import("@/lib/server/messages");
      await createWelcomeMessage({ uid, plan: variant.plan, role: variant.role });
    }
  } else {
    await users.doc(email).set({
      email,
      plan: variant.plan,
      role: variant.role,
      paymentStatus: "paid",
      isPrePaid: true,
      shopifyCustomerId: customerId,
      shopifyOrderId: orderId,
      expiresAt,
      createdAt: new Date(),
    });

    await sendEmail({
      to: email,
      subject: "Complete Your Speakeasy Signup",
      html:
        `<p>Welcome to Christa's Secret Swipe Speakeasy!</p>` +
        `<p>Your payment for the <strong>${variant.label}</strong> plan was successful. Finish creating your account to enter the lounge:</p>` +
        `<p><a href="${appUrl}/signup?email=${encodeURIComponent(email)}">Complete Your Signup</a></p>` +
        `<p>Your ${variant.label} membership will be applied automatically after you register with this email.</p>` +
        `<p>— The Secret Yarnery Team</p>`,
    }).catch((err) => {
      logError("shopify.email_prepaid_failed", { email, error: err.message });
    });
  }
}

// Revokes paid access immediately (orders/cancelled, refunds/create).
async function revokeAccess({ email, paymentStatus }) {
  const users = adminDb().collection("users");
  const existing = await findUserByEmail(users, email);
  if (!existing) return;
  const uid = existing.id;
  const patch = {
    plan: "flirting",
    role: "member",
    paymentStatus,
    isPrePaid: false,
    expiresAt: new Date().toISOString(),
    updatedAt: new Date(),
  };
  if (existing.id === existing.data()?.email || existing.data()?.isPrePaid) {
    // Pre-paid placeholder record — no real account yet.
    await existing.ref.delete().catch(() => existing.ref.update(patch));
    return;
  }
  await existing.ref.update(patch);
  await adminDb()
    .collection("subscriptions")
    .doc(uid)
    .set(
      {
        status: "canceled",
        plan: "monthly",
        planName: "flirting",
        tier: "lounge",
        role: "member",
        currentPeriodEnd: new Date(),
        canceledAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );
}

async function updateCustomerProfile({ email, data }) {
  const users = adminDb().collection("users");
  const existing = await findUserByEmail(users, email);
  if (!existing || existing.data()?.isPrePaid) return;
  const patch = { updatedAt: new Date() };
  if (data.first_name) patch.firstName = data.first_name;
  if (data.last_name) patch.lastName = data.last_name;
  if (data.first_name || data.last_name) {
    patch.name = `${data.first_name || ""} ${data.last_name || ""}`.trim();
  }
  if (data.phone) patch.phone = data.phone;
  await existing.ref.update(patch);
}

export async function POST(req) {
  try {
    const rawBody = await req.text();

    if (!verifyHmac(rawBody, req.headers.get("x-shopify-hmac-sha256"))) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const topic = req.headers.get("x-shopify-topic") || "";
    if (!topic || (!topic.startsWith("orders/") && topic !== "customers/update")) {
      return new NextResponse("Ignored", { status: 200 });
    }

    const data = JSON.parse(rawBody);
    const email = (data.email || data.customer?.email || "").toLowerCase().trim();
    if (!email) return new NextResponse("No email found", { status: 400 });

    switch (topic) {
      case "orders/paid":
      case "orders/create":
        await grantAccess({ data, email, order: data });
        break;
      case "orders/cancelled":
      case "orders/refunded":
      case "refunds/create":
        await revokeAccess({
          email,
          paymentStatus: topic === "refunds/create" || topic === "orders/refunded" ? "refunded" : "cancelled",
        });
        break;
      case "customers/update":
        await updateCustomerProfile({ email, data });
        break;
      default:
        logError("shopify.unhandled_topic", { topic });
    }

    return new NextResponse("Webhook processed", { status: 200 });
  } catch (error) {
    logError("shopify.webhook_error", { error: error.message });
    return new NextResponse("Internal Error", { status: 500 });
  }
}