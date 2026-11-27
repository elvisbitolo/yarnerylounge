# Christa's Speakeasy — self-hosted WebRTC platform

## Goal

Replace the JaaS media dependency with a first-party video-room product backed by an independently operated WebRTC SFU. The initial capacity target is 100 simultaneous participants across multiple lounges, not 100 participants in one conference.

The current JaaS integration remains available during development and validation. Do not disable JaaS or change production room routing until the replacement passes staged acceptance tests.

## Product requirements

- Multi-party audio/video rooms for members in different countries.
- Camera, microphone, screen sharing, participant list, leave/rejoin and connection-quality feedback.
- Existing room, tier, group, space, capacity, host and moderation authorization remains authoritative.
- Server-side recording, initially one recording at a time.
- Only the verified account `secretyarnery@gmail.com` may start or stop recordings.
- Recording authorization is enforced by the backend and media service, never only by hiding client controls.
- Recordings are private objects. The database stores metadata and access policy, not video bytes.
- Recording-active state is visible to all participants; consent, retention and deletion policy must be implemented before production recording.
- JaaS remains a rollback path until the new system is proven.

## Target architecture

1. **Next.js application** — existing authentication, membership, room authorization, UI and recording-library experience.
2. **Video control API** — issues short-lived, room-scoped connection grants after reusing the existing room access checks. It also authorizes recording start/stop.
3. **Signalling service** — persistent WebSocket connections; validates signed, short-lived grants; handles room lifecycle and WebRTC transport negotiation.
4. **mediasoup SFU workers** — terminate WebRTC transports and route audio/video. Use multiple workers/processes and multiple hosts as measured capacity requires.
5. **coturn** — STUN/TURN connectivity fallback for restrictive NATs and networks.
6. **Recording worker** — server-side capture/egress pipeline, isolated from the signalling and SFU control plane.
7. **Private object storage** — stores finalized recording files. Next.js issues authenticated, short-lived playback/download URLs.
8. **Supabase PostgreSQL** — room/recording metadata, ownership, processing state and audit events. Redis may be added for cross-process coordination and ephemeral presence; it is not the source of truth for membership.

## Important capacity definition

The initial target means 100 concurrent participants distributed across multiple lounges. It does not imply a single 100-person conference. Capacity must be established by load testing with realistic simulcast layers, camera-on ratios, audio activity, geographic network paths, TURN relay percentage and recording load.

Do not promise a fixed participant count per server based only on CPU/RAM. Measure ingress/egress bandwidth, packet loss, CPU, memory, worker load and end-to-end quality.

## Recording authorization

The owner-only rule is:

- Normalize the authenticated email from the server-verified session.
- Require exact equality with `secretyarnery@gmail.com`.
- Require the owner to be an authorized participant/administrator for the target room.
- Check room-level `recordingAllowed` and room status.
- Enforce the same rule in both Next.js and the video control service using a short-lived, signed server-to-server authorization.
- Never accept an email, role, `canRecord` boolean or recording permission supplied by the browser as proof.
- Record start/stop actor, room, timestamps, status and failure reason in an audit trail.
- Ensure participants receive a visible recording indicator and appropriate notice.

The current client-side eligibility expression permits staff/hosts/co-hosts. That is not sufficient for the new owner-only policy and must not be carried into the replacement.

## Security boundaries

- TLS for HTTPS and WSS; secure media transport using DTLS-SRTP.
- Short-lived, room-scoped grants with unique participant identity and expiry.
- Rate-limit token issuance and signalling actions.
- Validate room membership and capacity before issuing grants.
- Validate every signalling message and enforce payload size limits.
- Restrict SFU, Redis, TURN administration and recording worker ports to private networks where possible.
- Keep service secrets and TURN credentials server-side; use time-limited TURN credentials.
- Private recording bucket; no permanent public object URLs.
- Explicit recording notice/consent, retention, deletion and audit policy.
- Do not claim WebRTC media is end-to-end encrypted when an SFU or recording worker can access media.

## Migration strategy

1. Add the isolated video service and development environment without touching production JaaS.
2. Implement authenticated room grants and a single-room WebRTC proof of concept.
3. Add multi-participant mediasoup routing and TURN fallback.
4. Add owner-only server-side recording and private storage.
5. Integrate the existing Next.js room UI behind a feature flag.
6. Run staged tests (2, 5, 10, 25, 50, then 100 concurrent participants across rooms).
7. Canary selected test rooms; monitor and retain a JaaS rollback switch.
8. Migrate production rooms only after acceptance criteria are met.

## Acceptance criteria

- Existing tier, group, space, room-capacity and host restrictions still apply.
- Unauthorized users cannot obtain a room grant by calling APIs directly.
- Only the verified owner account can start or stop recording; client-side tampering does not bypass this.
- All participants see recording state.
- Recording files are finalized, private, playable and retrievable after a browser disconnect.
- Reconnection and TURN fallback work on restrictive networks.
- Load tests meet agreed quality thresholds at 100 concurrent participants across rooms.
- Production rollback to JaaS is documented and tested.
