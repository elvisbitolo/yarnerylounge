// LiveKit has been replaced by Jitsi as a Service (JaaS). These stubs keep the
// remaining host/participant endpoints and presence pages healthy: live presence
// simply reports nobody, and host moderation actions return a clear message.

export async function getLiveKitAdmin() {
  return null;
}

export async function listLiveParticipants() {
  return [];
}

export async function listLiveMemberUids() {
  return new Set();
}

export async function removeLiveParticipant() {
  return { ok: false, error: "Host tools have moved into the room" };
}

export async function setLiveParticipantPublish() {
  return { ok: false, error: "Host tools have moved into the room" };
}

export async function muteLiveParticipant() {
  return { ok: false, error: "Host tools have moved into the room" };
}

export async function endLiveKitRoom() {
  return { ok: true };
}

export async function startMusicIngress() {
  return { ok: false, error: "Room music is played from the browser" };
}

export async function stopMusicIngress() {
  return { ok: true };
}