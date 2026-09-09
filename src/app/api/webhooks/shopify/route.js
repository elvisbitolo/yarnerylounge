import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  mapShopifyLineItems,
  computeExpiresAt,
  shouldGrantMembership,
} from "@/lib/server/shopify";
import { sendEmail } from "@/lib/server/email";
import { logError } from "@/lib/server/log";
import { getPrisma } from "@/lib/db/prisma";

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

// Grants (or refreshes) paid access. Registered members get an in-place
// upgrade; unregistered buyers get a pre-paid record merged at signup.
async function grantAccess({ data, email, order }) {
  const prisma = getPrisma();
  const variant = mapShopifyLineItems(order.line_items || []);
  const expiresAt = computeExpiresAt(variant)?.toISOString() || "";
  const customerId = order.customer?.id?.toString() || "";
  const orderId = order.id?.toString() || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    const uid = existing.id;
    await prisma.user.update({
      where: { id: uid },
      data: {
        plan: variant.plan,
        role: variant.role,
        paymentStatus: "paid",
        isPrePaid: false,
        shopifyCustomerId: customerId,
        shopifyOrderId: orderId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        updatedAt: new Date(),
      },
    }).catch((err) => {
      logError("shopify.grant_user_prisma_failed", { error: err.message, uid });
    });

    const subData = {
      id: uid,
      userId: uid,
      provider: "shopify",
      status: "active",
      plan: variant.annual ? "annual" : "monthly",
      tier: variant.tier,
      planName: variant.plan,
      role: variant.role,
      shopifyCustomerId: customerId || "",
      shopifyOrderId: orderId || "",
    };
    if (expiresAt) subData.currentPeriodEnd = new Date(expiresAt);
    await prisma.subscription.upsert({
      where: { id: uid },
      create: subData,
      update: {
        provider: subData.provider,
        status: subData.status,
        plan: subData.plan,
        tier: subData.tier,
        planName: subData.planName,
        role: subData.role,
        shopifyCustomerId: subData.shopifyCustomerId,
        shopifyOrderId: subData.shopifyOrderId,
        ...(subData.currentPeriodEnd ? { currentPeriodEnd: subData.currentPeriodEnd } : {}),
      },
    }).catch((err) => {
      logError("shopify.grant_sub_prisma_failed", { error: err.message, uid });
    });

    await sendEmail({
      to: email,
      subject: "Your Speakeasy Membership is Active!",
      html:
        `<p>Hi ${existing.name || email},</p>` +
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
    await prisma.user.upsert({
      where: { id: email },
      create: {
        id: email,
        name: "",
        email,
        plan: variant.plan,
        role: variant.role,
        paymentStatus: "paid",
        isPrePaid: true,
        shopifyCustomerId: customerId,
        shopifyOrderId: orderId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdAt: new Date(),
      },
      update: {
        plan: variant.plan,
        role: variant.role,
        paymentStatus: "paid",
        isPrePaid: true,
        shopifyCustomerId: customerId,
        shopifyOrderId: orderId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    }).catch((err) => {
      logError("shopify.prepaid_user_prisma_failed", { error: err.message, email });
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
  const prisma = getPrisma();
  const existing = await prisma.user.findFirst({ where: { email } });
  if (!existing) return;
  const uid = existing.id;

  if (existing.id === existing.email || existing.isPrePaid) {
    // Pre-paid placeholder record — no real account yet.
    try {
      await prisma.user.delete({ where: { id: uid } });
    } catch (err) {
      logError("shopify.revoke_prepaid_del_prisma_failed", { error: err.message, uid });
    }
    return;
  }

  await prisma.user.update({
    where: { id: uid },
    data: {
      plan: "flirting",
      role: "member",
      paymentStatus,
      isPrePaid: false,
      expiresAt: new Date(),
      updatedAt: new Date(),
    },
  }).catch((err) => {
    logError("shopify.revoke_user_prisma_failed", { error: err.message, uid });
  });

  const canceledSub = {
    status: "canceled",
    plan: "monthly",
    planName: "flirting",
    tier: "flirting",
    role: "member",
    currentPeriodEnd: new Date(),
    canceledAt: new Date(),
  };
  await prisma.subscription.upsert({
    where: { id: uid },
    create: { id: uid, userId: uid, ...canceledSub },
    update: canceledSub,
  }).catch((err) => {
    logError("shopify.revoke_sub_prisma_failed", { error: err.message, uid });
  });
}

async function updateCustomerProfile({ email, data }) {
  const prisma = getPrisma();
  const existing = await prisma.user.findFirst({ where: { email } });
  if (!existing || existing.isPrePaid) return;
  const patch = { updatedAt: new Date() };
  if (data.first_name) patch.firstName = data.first_name;
  if (data.last_name) patch.lastName = data.last_name;
  if (data.first_name || data.last_name) {
    patch.name = `${data.first_name || ""} ${data.last_name || ""}`.trim();
  }
  if (data.phone) patch.phone = data.phone;
  await prisma.user.update({ where: { id: existing.id }, data: patch }).catch((err) => {
    logError("shopify.customer_profile_prisma_failed", { error: err.message, uid: existing.id });
  });
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
        // Never grant on an unpaid order — orders/create fires for every new
        // order, including abandoned checkouts and free $0 orders.
        if (!shouldGrantMembership({ topic, data })) {
          logError("shopify.order_not_paid", {
            topic,
            orderId: data?.id?.toString?.() || "",
            financialStatus: data?.financial_status || "",
          });
          break;
        }
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