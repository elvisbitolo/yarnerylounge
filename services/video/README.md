# Speakeasy Video Service

This directory is reserved for the independently deployed WebRTC signalling and mediasoup SFU control service.

It is intentionally isolated from the Next.js/Vercel request lifecycle: media sessions require long-lived WebSocket connections, UDP media ports, worker processes and predictable network capacity. They should not run inside ordinary serverless route handlers.

## Planned responsibilities

- Health/readiness endpoints.
- Authenticated WebSocket signalling.
- Validation of short-lived room-scoped grants issued by the Next.js backend.
- mediasoup worker/router lifecycle and WebRTC transports.
- Room and participant lifecycle events.
- Server-side recording orchestration through a separate recording worker.
- Metrics and structured operational logs.

## Trust model

The service must never trust a room ID, user ID, email, role, membership tier or recording permission supplied as an unsigned client field. It accepts only a valid, short-lived signed grant from the application backend and validates the grant's issuer, audience, expiry, room, participant and permitted actions.

The only recording principal is the server-verified account `secretyarnery@gmail.com`. The service must independently enforce this rule for every recording start/stop operation. UI visibility is not authorization.

## Deployment boundary

Deploy this service on dedicated compute with UDP media ports and TLS/WSS. Do not deploy it as a Vercel serverless function. Keep it behind a private control network where possible; expose only the required HTTPS/WSS and media/TURN ports.

## Implementation order

1. Service runtime, health checks, configuration validation and structured logging.
2. Signed grant verification and WebSocket authentication.
3. mediasoup worker and router lifecycle.
4. WebRTC transport creation/connect and producer/consumer signalling.
5. Room capacity and lifecycle enforcement.
6. TURN integration and network recovery.
7. Recording worker and private object storage integration.
8. Metrics, load tests, security tests and deployment automation.

See [the platform architecture](../../docs/video-platform-architecture.md) for the full requirements and migration plan.

No production traffic is routed here yet. JaaS remains the active provider until the replacement passes the acceptance criteria.
