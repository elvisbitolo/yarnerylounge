let _client = null;
let _ingressClient = null;

export async function getLiveKitAdmin() {
  if (_client) return _client;
  const { RoomServiceClient } = await import("livekit-server-sdk");
  const host = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!host || !key || !secret) return null;
  const url = new URL(host);
  _client = new RoomServiceClient(`${url.protocol}//${url.host}`, key, secret);
  return _client;
}

async function getIngressClient() {
  if (_ingressClient) return _ingressClient;
  const { IngressClient } = await import("livekit-server-sdk");
  const host = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!host || !key || !secret) return null;
  const url = new URL(host);
  _ingressClient = new IngressClient(`${url.protocol}//${url.host}`, key, secret);
  return _ingressClient;
}

export async function listLiveParticipants(slug) {
  const client = await getLiveKitAdmin();
  if (!client) return [];
  const participants = await client.listParticipants(slug);
  return participants.map((p) => ({
    identity: p.identity || "",
    name: p.name || p.identity || "Member",
    joinedAt: p.joinedAt ? Number(p.joinedAt) || 0 : 0,
    canPublish:
      !p.permissions || p.permissions.canPublish !== false,
    metadata: p.metadata || "",
  }));
}

export async function listLiveMemberUids() {
  const client = await getLiveKitAdmin();
  if (!client) return new Set();
  const uids = new Set();
  const rooms = await client.listRooms();
  for (const room of rooms) {
    const participants = await client.listParticipants(room.name);
    for (const p of participants) {
      const identity = p.identity || "";
      if (identity.startsWith("room-music-")) continue;
      uids.add(identity);
    }
  }
  return uids;
}

export async function removeLiveParticipant(slug, identity) {
  const client = await getLiveKitAdmin();
  if (!client) return { ok: false, error: "LiveKit not configured" };
  await client.removeParticipant(slug, identity);
  return { ok: true };
}

export async function setLiveParticipantPublish(slug, identity, canPublish) {
  const client = await getLiveKitAdmin();
  if (!client) return { ok: false, error: "LiveKit not configured" };
  await client.updateParticipant(slug, identity, {
    canPublish,
    canPublishData: true,
    canSubscribe: true,
  });
  return { ok: true };
}

// Mutes a participant's published microphone from the host side. The mute is
// enforced server-side on the LiveKit track, so it sticks regardless of what
// the participant's client tries.
export async function muteLiveParticipant(slug, identity) {
  const client = await getLiveKitAdmin();
  if (!client) return { ok: false, error: "LiveKit not configured" };
  const participants = await client.listParticipants(slug);
  const target = participants.find((p) => p.identity === identity);
  if (!target) {
    return { ok: false, error: "Participant not found in this room" };
  }
  const audioTrack = (target.tracks || []).find(
    (t) => t.source === "microphone" && t.trackSid
  );
  if (!audioTrack) {
    return { ok: true, muted: false };
  }
  await client.mutePublishedTrack(slug, identity, audioTrack.trackSid, true);
  return { ok: true, muted: true };
}

export async function endLiveKitRoom(slug) {
  const client = await getLiveKitAdmin();
  if (!client) return { ok: false, error: "LiveKit not configured" };
  try {
    await client.deleteRoom(slug);
  } catch (err) {
    const msg = String(err?.message || "");
    const code = String(err?.code ?? "").toLowerCase();
    const status = String(err?.status ?? "");
    const alreadyGone =
      /\bnot found\b/i.test(msg) ||
      /does not exist/i.test(msg) ||
      /no room/i.test(msg) ||
      code === "not_found" ||
      code === "5" ||
      status === "404";
    if (alreadyGone) return { ok: true };
    return { ok: false, error: "Could not end the room" };
  }
  return { ok: true };
}

const MUSIC_IDENTITY_PREFIX = "room-music-";

export async function startMusicIngress(slug, audioUrl, songName) {
  const client = await getIngressClient();
  if (!client) return { ok: false, error: "LiveKit Ingress not configured" };

  const { IngressInput } = await import("livekit-server-sdk");

  await stopMusicIngress(slug);

  const identity = `${MUSIC_IDENTITY_PREFIX}${slug}-${Date.now()}`;
  const info = await client.createIngress(IngressInput.URL_INPUT, {
    roomName: slug,
    name: songName || "Room Music",
    participantName: songName || "Music",
    participantIdentity: identity,
    url: audioUrl,
    enableTranscoding: true,
  });

  return { ok: true, ingressId: info.ingressId, identity };
}

export async function stopMusicIngress(slug) {
  const client = await getIngressClient();
  if (!client) return { ok: false, error: "LiveKit Ingress not configured" };

  const existing = await client.listIngress({ roomName: slug });
  for (const ingress of existing) {
    if (
      ingress.state?.status !== "INGRESS_ERROR" &&
      ingress.state?.status !== "INGRESS_IDLE" &&
      ingress.participantIdentity?.startsWith(MUSIC_IDENTITY_PREFIX)
    ) {
      try {
        await client.deleteIngress(ingress.ingressId);
      } catch {}
    }
  }
  return { ok: true };
}
