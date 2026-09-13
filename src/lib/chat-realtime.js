import { createClient } from "@supabase/supabase-js";

// Real-time chat: streams Postgres changes for a conversation over Supabase
// Realtime (WebSockets). Writes stay on the normal API -> Postgres path (the
// durable source of truth); this channel just makes the other member's screen
// update the moment a row lands, instead of waiting for the polling fallback.
// Ciphertext-sensitive columns are excluded from the event payload; clients
// re-fetch messages (server-side decrypt) to render.

const EVENT_COLUMNS = [
  "id",
  "conversationId",
  "senderId",
  "senderName",
  "createdAt",
  "readBy",
  "parentId",
  "replyCount",
  "hasAttachment",
];

// Conversation rows stream with only ordering-safe columns (no ciphertext).
const CONVERSATION_COLUMNS = ["id", "updatedAt", "lastMessageAt"];

let cachedClient = null;

function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cachedClient = createClient(url || "", anon || "", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cachedClient;
}

async function fetchRealtimeToken(conversationId) {
  const res = await fetch("/api/realtime/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("realtime unavailable");
  const data = await res.json();
  if (!data?.accessToken) throw new Error("realtime unavailable");
  return data.accessToken;
}

function setAuthToken(client, token) {
  if (typeof client.realtime?.setAuth === "function") {
    return client.realtime.setAuth(token);
  }
  return client.auth.setSession({ access_token: token, refresh_token: "" }).catch(() => {});
}

// Opens a realtime channel for one conversation. `onEvent` fires for every
// INSERT/UPDATE on ConversationMessage rows belonging to that conversation.
// Returns an async cleanup function.
export async function subscribeConversation(conversationId, { onEvent }) {
  const token = await fetchRealtimeToken(conversationId);
  const client = getSupabaseClient();

  try {
    await setAuthToken(client, token);
  } catch {
    // auth failure — the caller's poll fallback keeps the thread live
  }

  let disposed = false;
  const channel = client
    .channel(`conversation:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ConversationMessage",
        filter: `conversationId=eq.${conversationId}`,
        columns: EVENT_COLUMNS,
      },
      (payload) => {
        if (!disposed) onEvent(payload);
      }
    )
    .subscribe();

  return () => {
    disposed = true;
    if (channel) channel.unsubscribe().catch(() => {});
  };
}

// Subscribes to the member's own conversation list so the inbox rail reorders
// and updates live when a message lands in any of them. RLS only streams rows
// the member belongs to; the Conversation UPDATE event carries ordering-safe
// columns only. `onEvent` fires per change and the caller re-fetches the list.
export async function subscribeInbox({ onEvent }) {
  const token = await fetchRealtimeToken("");
  const client = getSupabaseClient();

  try {
    await setAuthToken(client, token);
  } catch {
    // fall back to polling
  }

  let disposed = false;
  const channel = client
    .channel("inbox:conversations")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "Conversation",
        columns: CONVERSATION_COLUMNS,
      },
      (payload) => {
        if (!disposed) onEvent(payload);
      }
    )
    .subscribe();

  return () => {
    disposed = true;
    if (channel) channel.unsubscribe().catch(() => {});
  };
}