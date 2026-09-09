"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { JaaSMeeting } from "@jitsi/react-sdk";
import { LogOut, MessagesSquare, Camera, CameraOff, Mic, MicOff, RefreshCcw, WifiOff } from "lucide-react";
import BackButton from "@/components/BackButton";
import AmbientAudio from "@/components/AmbientAudio";
import RoomBackground from "@/components/RoomBackground";
import RoomMusicPicker from "@/components/RoomMusicPicker";
import RoomDataProvider from "./RoomDataProvider";
import RoomChat from "./RoomChat";
import styles from "./room.module.css";
import {
  JITSI_ERROR,
  normalizeJitsiError,
  normalizeMediaError,
  jitsiErrorInfo,
  validateTokenResponse,
  logDevTiming,
} from "@/lib/jitsi-errors";

// Jitsi toolbar buttons: remove camera/mic so view-only tiers and muted-by-design
// rooms cannot unmute through the Jitsi UI (server-side gating stays authoritative).
const VIEWER_TOOLBAR = [
  "chat",
  "raisehand",
  "fullscreen",
  "filmstrip",
  "tileview",
  "settings",
  "videoquality",
  "security",
];

// Device detection is intentionally capped: modest resolution warms the device
// quickly and keeps the camera prompt/track fast, which is the root cause of the
// "Connecting your camera" stall on higher-end cameras.
const MEDIA_VIDEO_CONSTRAINTS = {
  height: { ideal: 540, max: 720 },
  width: { ideal: 960, max: 1280 },
  facingMode: "user",
  frameRate: { ideal: 24, max: 30 },
};
const MEDIA_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const DETECT_TIMEOUT_MS = 9000;
const CAMERA_READY_TIMEOUT_MS = 12000;
const RECONNECT_WATCHDOG_MS = 20000;

// The JaaS web client boots + signals asynchronously inside its iframe; keep the
// wait visible and recoverable instead of a silent black screen that hangs.
const CONNECT_STALL_MS = 20000;
const CONNECT_TIMEOUT_MS = 60000;
const TOKEN_TTL_MS = 45000;

const VIDEO_FAILED = new Set([
  JITSI_ERROR.CAMERA_PERMISSION_ERROR,
  JITSI_ERROR.CAMERA_UNAVAILABLE,
  JITSI_ERROR.CAMERA_IN_USE,
  JITSI_ERROR.CAMERA_TIMEOUT,
  JITSI_ERROR.CAMERA_UNSUPPORTED,
  JITSI_ERROR.UNKNOWN_ERROR,
]);

const MIC_FAILED = new Set([
  JITSI_ERROR.MIC_PERMISSION_ERROR,
  JITSI_ERROR.MIC_UNAVAILABLE,
  JITSI_ERROR.MIC_IN_USE,
  JITSI_ERROR.UNKNOWN_ERROR,
]);

function withTimeout(promise, ms, name) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      const err = new Error(`${name} timed out`);
      err.name = "MediaTimeout";
      reject(err);
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

export default function RoomClient({
  roomName,
  slug,
  roomId,
  kind,
  role,
  opensAt,
  isHost,
  isCoHost,
  canPublishPlan = true,
  canWriteChatPlan = false,
  planKey = "flirting",
  alwaysOn,
  vibeMode = "",
  vibeRule = "",
  forceMuteOnJoin = false,
  raiseHandToTalk = false,
  disableAudio = false,
  musicUrl,
  musicPlaying,
  musicFileId,
  hostId = "",
  userId = "",
  userEmail = "",
  userName = "Member",
  userAvatar = "",
}) {
  const router = useRouter();
  const t = useTranslations("rooms");

  // ---- Staged lifecycle ----
  // idle -> authenticating (token) -> connecting (mounting JaaS) -> connected.
  // Camera/audio initialize independently and never block any stage.
  const [phase, setPhase] = useState("idle");
  const [token, setToken] = useState("");
  const [jitsiRoom, setJitsiRoom] = useState("");
  const [jitsiAppId, setJitsiAppId] = useState("");
  const [roomError, setRoomError] = useState(null);
  const [inlineError, setInlineError] = useState("");
  const [connStatus, setConnStatus] = useState("connecting"); // connecting | connected | reconnecting | lost
  const [participantCount, setParticipantCount] = useState(0);
  const [showChat, setShowChat] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [mountKey, setMountKey] = useState(0);
  const [connectAt, setConnectAt] = useState(0);
  const [connStalled, setConnStalled] = useState(false);

  // ---- Media state (camera/mic live their own lifecycle) ----
  const [videoDesired, setVideoDesired] = useState(true);
  const [micDesired, setMicDesired] = useState(true);
  const [videoStatus, setVideoStatus] = useState("idle"); // idle|starting|ready|off|denied|unavailable|inuse|timeout|unsupported|error
  const [micStatus, setMicStatus] = useState("idle");
  const [cameraMsg, setCameraMsg] = useState("");
  const [micMsg, setMicMsg] = useState("");
  const [previewStream, setPreviewStream] = useState(null);

  const apiRef = useRef(null);
  const tileForcedRef = useRef(false);
  const previewVideoRef = useRef(null);
  const activeStreamRef = useRef(null);
  const mountKeyRef = useRef(0);

  // Mirror refs so timers/event handlers always read fresh values.
  const phaseRef = useRef("idle");
  const connStatusRef = useRef("connecting");
  const videoDesiredRef = useRef(true);
  const micDesiredRef = useRef(true);
  const videoStatusRef = useRef("idle");
  const micStatusRef = useRef("idle");
  const apiReadyRef = useRef(false);

  const cameraWatchdogRef = useRef(null);
  const reconnectWatchdogRef = useRef(null);
  const connectWatchdogRef = useRef(null);
  const connectAtRef = useRef(0);
  const tokenRef = useRef(null);
  const gotoRoomRef = useRef(null);

  const isBroadcast = kind === "broadcast";
  const isStaff = role === "owner" || role === "moderator";
  const viewerOnly = isBroadcast && !isHost && !isCoHost;
  const planCanPublish = canPublishPlan || isStaff || isHost || isCoHost;
  const canWriteChat = canWriteChatPlan || isStaff || isHost || isCoHost;
  const viewer = !planCanPublish || viewerOnly;
  const audioLocked = disableAudio || forceMuteOnJoin;
  const canRecord = isStaff || isHost || isCoHost;

  // Always-on lounges are joinable any time; only scheduled (non-alwaysOn)
  // rooms gate on the next upcoming start for non-hosts.
  const waiting = !alwaysOn && Boolean(opensAt) && !isHost && now < opensAt;
  const waitSeconds = waiting ? Math.max(0, Math.ceil((opensAt - now) / 1000)) : 0;
  const connectSeconds =
    phase === "connecting" && connectAt ? Math.max(0, Math.floor((now - connectAt) / 1000)) : 0;

  // Keep mirrored refs current.
  phaseRef.current = phase;
  connStatusRef.current = connStatus;
  videoDesiredRef.current = videoDesired;
  micDesiredRef.current = micDesired;
  videoStatusRef.current = videoStatus;
  micStatusRef.current = micStatus;

  function formatWait(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  // Full-screen video room: lock scroll everywhere, on every device.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.overscrollBehaviorY = "";
      body.style.overscrollBehaviorY = "";
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Assign the preview stream to the <video> element once available.
  useEffect(() => {
    const el = previewVideoRef.current;
    if (!el || !previewStream) return;
    el.srcObject = previewStream;
    return () => {
      if (el.srcObject === previewStream) el.srcObject = null;
    };
  }, [previewStream]);

  // Teardown everything on unmount.
  useEffect(() => {
    return () => {
      stopAllMedia();
      disposeApi();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warm the JaaS token while the user still sits on the prejoin screen, so
  // clicking Pop in mounts the meeting immediately instead of waiting on the
  // token round-trip. Failures are silent — handleJoin fetches fresh if needed.
  useEffect(() => {
    let active = true;
    fetch("/api/jitsi/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    })
      .then((r) => (r.ok ? r.json().catch(() => null) : null))
      .then((data) => {
        if (active && data && validateTokenResponse(data)) {
          tokenRef.current = { at: Date.now(), ...data };
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function armConnectWatchdog() {
    if (connectWatchdogRef.current) clearTimeout(connectWatchdogRef.current);
    connectWatchdogRef.current = setTimeout(() => {
      connectWatchdogRef.current = null;
      if (phaseRef.current !== "connecting" || connStatusRef.current === "connected") return;
      setConnStalled(true);
      connectWatchdogRef.current = setTimeout(() => {
        connectWatchdogRef.current = null;
        if (phaseRef.current !== "connecting") return;
        setRoomError(jitsiErrorInfo(JITSI_ERROR.CONFERENCE_CONNECTION_ERROR));
        setPhase("error");
      }, CONNECT_TIMEOUT_MS - CONNECT_STALL_MS);
    }, CONNECT_STALL_MS);
  }

  function startConnecting() {
    const at = Date.now();
    connectAtRef.current = at;
    setConnectAt(at);
    setConnStalled(false);
    setConnStatus("connecting");
    setPhase("connecting");
    armConnectWatchdog();
  }

  function stopAllMedia() {
    const stream = activeStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      activeStreamRef.current = null;
    }
    setPreviewStream(null);
  }

  function clearWatchdogs() {
    if (cameraWatchdogRef.current) clearTimeout(cameraWatchdogRef.current);
    if (reconnectWatchdogRef.current) clearTimeout(reconnectWatchdogRef.current);
    if (connectWatchdogRef.current) clearTimeout(connectWatchdogRef.current);
    cameraWatchdogRef.current = null;
    reconnectWatchdogRef.current = null;
    connectWatchdogRef.current = null;
  }

  function disposeApi() {
    try {
      apiRef.current?.dispose?.();
    } catch {
      /* already gone */
    }
    apiRef.current = null;
    apiReadyRef.current = false;
    tileForcedRef.current = false;
  }

  // ---- Device preflight (independent of the JaaS connection) ----

  function friendlyMediaError(code, kind) {
    if (kind === "camera" && code === JITSI_ERROR.CAMERA_PERMISSION_ERROR) return t("cameraDenied");
    if (kind === "camera" && code === JITSI_ERROR.CAMERA_UNAVAILABLE) return t("noCamera");
    if (kind === "camera" && code === JITSI_ERROR.CAMERA_IN_USE) return t("cameraInUse");
    if (kind === "camera" && code === JITSI_ERROR.CAMERA_TIMEOUT) return t("cameraTimeout");
    if (kind === "camera" && code === JITSI_ERROR.CAMERA_UNSUPPORTED) return t("cameraUnsupported");
    if (kind === "mic" && code === JITSI_ERROR.MIC_PERMISSION_ERROR) return t("micDenied");
    if (kind === "mic" && code === JITSI_ERROR.MIC_UNAVAILABLE) return t("micUnavailable");
    if (kind === "mic" && code === JITSI_ERROR.MIC_IN_USE) return t("micInUse");
    return t("cameraGenericFail");
  }

  async function startDetecting() {
    if (viewer) return;
    const wantVideo = videoDesiredRef.current;
    const wantAudio = micDesiredRef.current && !audioLocked;
    if (!wantVideo && !wantAudio) return;

    stopAllMedia();
    setCameraMsg("");
    setMicMsg("");
    if (wantVideo) setVideoStatus("starting");
    if (wantAudio) setMicStatus("starting");

    const t0 = Date.now();
    try {
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          video: wantVideo ? MEDIA_VIDEO_CONSTRAINTS : false,
          audio: wantAudio ? MEDIA_AUDIO_CONSTRAINTS : false,
        }),
        DETECT_TIMEOUT_MS,
        "Media detection"
      );
      if (!activeStreamRef.current) activeStreamRef.current = stream;
      const hasVideo = stream.getVideoTracks().length > 0;
      const hasAudio = stream.getAudioTracks().length > 0;
      if (wantVideo) {
        if (hasVideo) {
          setVideoStatus("ready");
          logDevTiming("camera initialization", t0);
        } else {
          setVideoStatus("unavailable");
        }
      }
      if (wantAudio) {
        setMicStatus(hasAudio ? "ready" : "unavailable");
      }
      if (hasVideo) setPreviewStream(stream);
      autoEnableIfInside();
    } catch (err) {
      const timedOut = err?.name === "MediaTimeout";
      const kindWanted = wantVideo && !wantAudio ? "camera" : wantAudio && !wantVideo ? "mic" : "camera";
      const n = timedOut
        ? { code: JITSI_ERROR.CAMERA_TIMEOUT, message: friendlyMediaError(JITSI_ERROR.CAMERA_TIMEOUT, "camera") }
        : normalizeMediaError(err, kindWanted);
      if (kindWanted === "camera") {
        setVideoStatus("timeout");
        setCameraMsg(n.message);
      } else {
        setMicStatus("timeout");
        setMicMsg(n.message);
      }
    }
  }

  function stopPreviewAndMark() {
    stopAllMedia();
    setVideoStatus((s) => (videoDesiredRef.current ? "off" : s));
    setMicStatus((s) => (micDesiredRef.current ? "off" : s));
  }

  function toggleCamera() {
    const next = !videoDesiredRef.current;
    setVideoDesired(next);
    if (next) {
      startDetecting();
    } else {
      stopAllMedia();
      setVideoStatus("off");
      setCameraMsg("");
    }
  }

  function toggleMic() {
    const next = !micDesiredRef.current;
    setMicDesired(next);
    if (next) {
      startDetecting();
    } else {
      stopAllMedia();
      setMicStatus("off");
      setMicMsg("");
    }
  }

  // Convenience: if already inside the room, push the desired device state into
  // Jitsi once the local track is ready (without ever blocking the connection).
  function autoEnableIfInside() {
    const api = apiRef.current;
    if (!api) return;
    const stage = phaseRef.current;
    if (stage !== "connected") return;
    try {
      const readyVideo = videoStatusRef.current === "ready";
      const readyMic = micStatusRef.current === "ready";
      if (videoDesiredRef.current && readyVideo) {
        api.executeCommand("toggleVideo");
      }
      if (micDesiredRef.current && !audioLocked && readyMic) {
        api.executeCommand("toggleAudio");
      }
    } catch {
      /* api not ready yet */
    }
  }

  function retryCamera() {
    setCameraMsg("");
    setVideoStatus("starting");
    const api = apiRef.current;
    if (api) {
      try {
        api.executeCommand("toggleVideo");
      } catch {
        /* retry via remount if needed */
      }
    }
    armCameraWatchdog();
  }

  function retryMic() {
    setMicMsg("");
    setMicStatus("starting");
    const api = apiRef.current;
    if (api) {
      try {
        api.executeCommand("toggleAudio");
      } catch {
        /* retry via remount if needed */
      }
    }
  }

  // ---- Jitsi event wiring ----

  function armCameraWatchdog() {
    if (cameraWatchdogRef.current) clearTimeout(cameraWatchdogRef.current);
    cameraWatchdogRef.current = setTimeout(() => {
      const m = videoStatusRef.current;
      if (phaseRef.current !== "connected") return;
      if (videoDesiredRef.current && m !== "ready" && !VIDEO_FAILED.has(m)) {
        setVideoStatus("timeout");
        setCameraMsg(t("cameraTimeout"));
      }
    }, CAMERA_READY_TIMEOUT_MS);
  }

  function armReconnectWatchdog() {
    if (reconnectWatchdogRef.current) clearTimeout(reconnectWatchdogRef.current);
    reconnectWatchdogRef.current = setTimeout(() => {
      if (connStatusRef.current === "reconnecting") {
        setConnStatus("lost");
        setRoomError(jitsiErrorInfo(JITSI_ERROR.CONNECTION_LOST));
        setPhase("error");
      }
    }, RECONNECT_WATCHDOG_MS);
  }

  function handleConnectedMedia() {
    armCameraWatchdog();
    autoEnableIfInside();
  }

  function handleApiReady(api) {
    if (!api) return;
    apiRef.current = api;
    apiReadyRef.current = true;
    const syncCount = () => {
      try {
        setParticipantCount(api.getParticipantsInfo()?.length || 0);
      } catch {
        /* not ready yet */
      }
    };
    api.addEventListener("participantJoined", syncCount);
    api.addEventListener("participantLeft", syncCount);

    api.addEventListener("videoConferenceJoined", () => {
      syncCount();
      if (connectAtRef.current) {
        logDevTiming("JAAS joined room", connectAtRef.current);
        connectAtRef.current = 0;
      }
      setConnectAt(0);
      setConnStalled(false);
      setPhase("connected");
      setConnStatus("connected");
      clearWatchdogs();
      handleConnectedMedia();
    });

    api.addEventListener("videoConferenceLeft", () => {
      clearWatchdogs();
      connectAtRef.current = 0;
      setConnectAt(0);
      setConnStalled(false);
      setConnStatus("connecting");
      setPhase("idle");
      setInlineError("");
    });

    api.addEventListener("connectionEstablished", () => {
      setConnStatus("connected");
      if (reconnectWatchdogRef.current) clearTimeout(reconnectWatchdogRef.current);
    });

    api.addEventListener("connectionInterrupted", () => {
      if (phaseRef.current !== "connected") return;
      setConnStatus("reconnecting");
      armReconnectWatchdog();
    });

    api.addEventListener("connectionRestored", () => {
      setConnStatus("connected");
      if (reconnectWatchdogRef.current) clearTimeout(reconnectWatchdogRef.current);
    });

    api.addEventListener("conferenceFailed", (error) => {
      const n = normalizeJitsiError(error);
      setRoomError(n);
      setPhase("error");
    });

    api.addEventListener("errorOccurred", (error) => {
      const type = error?.error?.type || error?.type || "";
      const fatal =
        typeof type === "string" &&
        type.toLowerCase().includes("conference") &&
        (error?.fatal === true || error?.error?.fatal === true);
      if (fatal) {
        setRoomError(normalizeJitsiError(error));
        setPhase("error");
      } else if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.info("[room] non-fatal iframe event:", type || error?.error?.name || "unknown");
      }
    });

    // Local media track feedback: the source of truth for camera/mic status.
    api.addEventListener("videoAvailable", (available) => {
      if (available) {
        setVideoStatus("ready");
        setCameraMsg("");
      } else if (videoDesiredRef.current && phaseRef.current === "connected") {
        setVideoStatus("off");
      }
    });
    api.addEventListener("audioAvailable", (available) => {
      if (available) setMicStatus("ready");
    });

    // Gallery view by default: correct Jitsi once if it lands on stage/film view.
    api.addEventListener("tileViewChanged", ({ visible }) => {
      if (!visible && !tileForcedRef.current) {
        tileForcedRef.current = true;
        api.executeCommand("toggleTileView");
      }
    });

    syncCount();
  }

  function handleLeave() {
    try {
      apiRef.current?.executeCommand("hangup");
    } catch {
      /* already gone */
    }
    clearWatchdogs();
    stopAllMedia();
    disposeApi();
    connectAtRef.current = 0;
    setConnectAt(0);
    setConnStalled(false);
    router.push("/rooms");
  }

  function dismissError() {
    clearWatchdogs();
    disposeApi();
    stopAllMedia();
    connectAtRef.current = 0;
    setConnectAt(0);
    setConnStalled(false);
    setRoomError(null);
    setConnStatus("connecting");
    setPhase("idle");
  }

  function reconnectNow() {
    clearWatchdogs();
    stopAllMedia();
    disposeApi();
    setRoomError(null);
    setInlineError("");
    setMountKey((k) => k + 1);
    startConnecting();
  }

  async function handleJoin() {
    setBusyGuard();
    setInlineError("");
    setRoomError(null);
    setPhase("authenticating");

    // Camera/mic detection runs in parallel and NEVER gates joining.
    if (!viewer && (videoDesiredRef.current || (micDesiredRef.current && !audioLocked))) {
      startDetecting();
    }

    const t0 = Date.now();
    let tokenData;

    const cached = tokenRef.current;
    if (cached && Date.now() - cached.at <= TOKEN_TTL_MS) {
      tokenData = cached;
    } else {
      try {
        const res = await fetch("/api/jitsi/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        });
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 403) {
          router.push("/rooms");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = data?.code;
          if (code === "jaas_not_configured") {
            setInlineError(t("unavailableRoom"));
          } else {
            setInlineError(t("joinFailedGeneric"));
          }
          setPhase("idle");
          return;
        }
        if (!validateTokenResponse(data)) {
          setInlineError(t("joinFailedGeneric"));
          setPhase("idle");
          return;
        }
        tokenData = { at: Date.now(), ...data };
        tokenRef.current = tokenData;
        logDevTiming("JAAS token request", t0);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[room] token request failed", err);
        setInlineError(t("joinFailedGeneric"));
        setPhase("idle");
        return;
      }
    }

    setToken(tokenData.token);
    setJitsiRoom(tokenData.roomName);
    setJitsiAppId(tokenData.appId || "");
    mountKeyRef.current += 1;
    setMountKey(mountKeyRef.current);
    startConnecting();
  }

  function setBusyGuard() {
    /* join is instantaneous UI-wise; phases drive the button state */
  }

  // ---- Media status helpers for the in-room overlay ----

  const videoFailed = VIDEO_FAILED.has(videoStatus);
  const micFailed = MIC_FAILED.has(micStatus);
  const videoToast =
    videoDesired && phase === "connected" && videoStatus === "starting"
      ? t("startCamera")
      : videoDesired && phase === "connected" && videoFailed
      ? cameraMsg || friendlyMediaError(videoStatus, "camera")
      : "";
  const micToast =
    micDesired && !audioLocked && phase === "connected" && micFailed
      ? micMsg || friendlyMediaError(micStatus, "mic")
      : "";
  const showVideoRetry = videoDesired && phase === "connected" && videoFailed;
  const showMicRetry = micDesired && !audioLocked && phase === "connected" && micFailed;

  const configOverwrite = {
    prejoinConfig: { enabled: false },
    enableClosePage: false,
    disableInviteFunctions: true,
    disableProfile: !isStaff,
    channelLastN: -1,
    tileView: { enabled: true, maxColumns: 4 },
    // Start everything muted so joining never blocks on a slow/unreliable
    // camera. Desired devices are enabled right after join, independently.
    startWithAudioMuted: true,
    startWithVideoMuted: true,
    startAudioMuted: true,
    startVideoMuted: true,
    // Cap resolution: lower encode cost + faster local track ready.
    constraints: {
      video: { height: { ideal: 540, max: 720 }, width: { ideal: 960, max: 1280 } },
      audio: MEDIA_AUDIO_CONSTRAINTS,
    },
    disableSimulcast: true,
    resolution: 720,
    toolbarButtons: viewer || audioLocked ? VIEWER_TOOLBAR : undefined,
  };

  const interfaceConfigOverwrite = {
    SHOW_WATERMARK: false,
    SHOW_BRAND_WATERMARK: false,
    SHOW_JITSI_WATERMARK: false,
    SHOW_CHROME_EXTENSION_BADGE: false,
    HIDE_INVITE_MORE_HEADER: true,
    MOBILE_APP_PROMO: false,
    GENERATE_ROOMNAMES_ON_WITHOUT_JOIN: false,
  };

  const waitScreen = (
    <main className={styles.page}>
      <RoomBackground show={alwaysOn} musicActive={!!musicPlaying} />
      <div className={styles.container}>
        <div className={styles.prejoinWrap}>
          <BackButton fallback="/rooms" label="Back to rooms" />
          <div className={styles.prejoin}>
            <h1 className={styles.title}>{roomName}</h1>
            <p className={styles.subtitle}>This room opens at the scheduled time.</p>
            <p className={styles.countdown} role="timer" aria-label="Time until the room opens">
              {formatWait(waitSeconds)}
            </p>
            <p className={styles.waitHint}>
              {opensAt
                ? new Date(opensAt).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : ""}
            </p>
            <p className={styles.waitHint}>We&apos;ll let you in automatically when it starts.</p>
          </div>
        </div>
      </div>
    </main>
  );

  const prejoin = (
    <main className={styles.page}>
      <RoomBackground show={alwaysOn} musicActive={!!musicPlaying} />
      <div className={styles.container}>
        <div className={styles.prejoinWrap}>
          <BackButton fallback="/rooms" label="Back to rooms" />
          <div className={styles.prejoin}>
            <h1 className={styles.title}>{roomName}</h1>
            <p className={styles.subtitle}>
              {viewer
                ? "Viewing as a guest — subscriptions unlock your camera & mic."
                : vibeMode === "silent"
                ? "Absolute-silence focus room. Audio stays off — cameras on, microphones muted."
                : vibeMode === "force-mute"
                ? "Solo-focused flow. Microphones muted by default, text chat for quick hellos."
                : vibeMode === "raise-hand"
                ? "Soft-spoken room. Raise your hand to talk and the host will bring you in."
                : vibeMode === "auto"
                ? "The loud, friendly welcome room — camera and mic are on as soon as you pop in."
                : alwaysOn
                ? "Always open — pop in anytime. Meet new members and settle into the lounge."
                : isBroadcast
                ? "This is a live broadcast. Join to watch the stream."
                : "Get ready, then join the live room."}
            </p>

            {!viewer && (
              <div className={styles.previewWrap}>
                <div className={styles.preview}>
                  {videoDesired && videoStatus === "ready" && previewStream ? (
                    <video ref={previewVideoRef} className={styles.previewVideo} autoPlay playsInline muted />
                  ) : (
                    <div className={styles.previewAvatar}>
                      {userAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.previewAvatarImg} src={userAvatar} alt="" />
                      ) : (
                        String(userName || "?").charAt(0).toUpperCase()
                      )}
                    </div>
                  )}
                  {videoDesired && videoFailed && cameraMsg && (
                    <p className={styles.previewError}>{cameraMsg}</p>
                  )}
                </div>

                <div className={styles.prejoinToggles}>
                  <button
                    type="button"
                    className={videoDesired ? styles.prejoinToggleOn : styles.prejoinToggle}
                    onClick={toggleCamera}
                    aria-pressed={videoDesired}
                  >
                    {videoDesired ? <Camera size={16} /> : <CameraOff size={16} />}
                    {videoDesired ? t("turnOffCam") : t("turnOnCam")}
                  </button>
                  {!audioLocked && (
                    <button
                      type="button"
                      className={micDesired ? styles.prejoinToggleOn : styles.prejoinToggle}
                      onClick={toggleMic}
                      aria-pressed={micDesired}
                    >
                      {micDesired ? <Mic size={16} /> : <MicOff size={16} />}
                      {micDesired ? t("muteMic") : t("unmuteMic")}
                    </button>
                  )}
                </div>

                {videoDesired && videoStatus === "starting" && (
                  <p className={styles.watchNote}>{t("startCamera")}</p>
                )}
              </div>
            )}

            {viewer && <p className={styles.watchNote}>{t("watchingOnly")}</p>}
            {(audioLocked && !viewer) || (vibeMode === "force-mute" && !viewer) ? (
              <p className={styles.watchNote}>
                🔇 Audio is always off in this room — cameras stay on for company.
              </p>
            ) : null}
            {raiseHandToTalk && !viewer && (
              <p className={styles.watchNote}>
                🙋 Raise your hand to talk — the host will invite you to speak.
              </p>
            )}
            {inlineError && <p className={styles.error}>{inlineError}</p>}
            <button className={styles.join} onClick={handleJoin} disabled={phase === "authenticating"}>
              {phase === "authenticating" ? t("joining") : alwaysOn ? "Pop in" : isBroadcast ? "Join as viewer" : "Join room"}
            </button>
            <p className={styles.watchNote}>
              {viewer
                ? "Your browser will not ask for your camera or microphone."
                : "Your browser will ask for camera & mic access when you join."}
            </p>
          </div>
        </div>
      </div>
    </main>
  );

  const connectedRoom = (
    <main className={styles.page}>
      <RoomBackground show={alwaysOn} musicActive={!!musicPlaying} autoplaySound={phase === "connected"} />
      <div className={styles.roomWrap}>
        <AmbientAudio
          active={alwaysOn}
          musicUrl={musicUrl}
          musicPlaying={musicPlaying}
          musicFileId={musicFileId}
          hasVideoBackdrop={alwaysOn}
          pauseWhenBusy={participantCount > 1}
        />
        {alwaysOn && isStaff && <RoomMusicPicker isStaff={isStaff} roomSlug={slug} />}

        <div className={styles.liveRoom}>
          <header className={styles.roomHeader}>
            <div className={styles.roomHeaderCopy}>
              <h1 className={styles.roomHeaderTitle}>{roomName}</h1>
              <p className={styles.roomHeaderDesc}>
                {isBroadcast ? "Live broadcast to the community" : "A live gathering with the community"}
              </p>
            </div>
            <div className={styles.roomHeaderMeta}>
              <span className={styles.liveViewers}>
                <span className={styles.liveDot} aria-hidden="true" />
                {t("live")} · {participantCount}
              </span>
              {canRecord && (
                <span className={styles.recordChip} title={t("recordingAvail")}>
                  <span className={styles.recordDot} aria-hidden="true" /> REC
                </span>
              )}
            </div>
          </header>

          <div
            className={
              phase === "connecting"
                ? `${styles.jitsiStage} ${styles.jitsiStageWait}`
                : `${styles.jitsiStage} ${styles.jitsiStageReady}`
            }
          >
            <JaaSMeeting
              key={mountKey}
              appId={jitsiAppId}
              roomName={jitsiRoom}
              jwt={token}
              userInfo={{ displayName: userName, email: userEmail }}
              configOverwrite={configOverwrite}
              interfaceConfigOverwrite={interfaceConfigOverwrite}
              onApiReady={handleApiReady}
              onReadyToClose={dismissError}
              getIFrameRef={(parentNode) => {
                if (!parentNode) return;
                parentNode.style.width = "100%";
                parentNode.style.height = "100%";
                parentNode.style.border = "0";
                const iframe = parentNode.querySelector("iframe");
                if (iframe) {
                  iframe.style.width = "100%";
                  iframe.style.height = "100%";
                  iframe.style.border = "0";
                }
              }}
            />

            {phase === "connecting" && (
              <div
                className={connStalled ? `${styles.stageJoin} ${styles.stageJoinStalled}` : styles.stageJoin}
                aria-live="polite"
              >
                <div className={styles.stageJoinCard}>
                  <span className={styles.stageJoinSpinner} aria-hidden="true" />
                  <p className={styles.stageJoinTitle}>{t("connectingRoom")}</p>
                  <p className={styles.stageJoinRoom}>{roomName}</p>
                  <p className={styles.stageJoinHint}>
                    {connStalled
                      ? t("connectingStalled")
                      : connectSeconds > 2
                        ? t("connectingElapsed", { seconds: String(connectSeconds) })
                        : t("connectingShortWait")}
                  </p>
                  {connStalled && (
                    <button type="button" className={styles.stageJoinRetry} onClick={reconnectNow}>
                      <RefreshCcw size={14} />
                      {t("retry")}
                    </button>
                  )}
                </div>
              </div>
            )}

            {connStatus === "reconnecting" && phase === "connected" && (
              <div className={styles.stagePill} aria-live="polite">
                <WifiOff size={15} />
                {t("reconnecting")}
              </div>
            )}

            {(videoToast || showVideoRetry) && (
              <div className={styles.mediaToast} role="status">
                <span>{videoToast || cameraMsg}</span>
                {showVideoRetry && (
                  <button type="button" onClick={retryCamera} className={styles.mediaRetry}>
                    <RefreshCcw size={13} />
                    {t("retryCamera")}
                  </button>
                )}
              </div>
            )}

            {(micToast || showMicRetry) && (
              <div className={`${styles.mediaToast} ${styles.mediaToastMic}`} role="status">
                <span>{micToast || micMsg}</span>
                {showMicRetry && (
                  <button type="button" onClick={retryMic} className={styles.mediaRetry}>
                    <RefreshCcw size={13} />
                    {t("retryMic")}
                  </button>
                )}
              </div>
            )}
          </div>

          {showChat && (
            <div className={styles.chatSheet}>
              <div className={styles.chatSheetHeader}>
                <span className={styles.chatSheetTitle}>
                  <MessagesSquare size={15} />
                  Room chat
                </span>
                <button
                  type="button"
                  className={styles.chatSheetClose}
                  onClick={() => setShowChat(false)}
                  aria-label={t("closeChat")}
                >
                  ×
                </button>
              </div>
              <div className={styles.chatSheetBody}>
                <RoomDataProvider
                  roomId={roomId}
                  currentUserId={userId}
                  currentUserName={userName}
                  currentUserAvatar={userAvatar}
                  canModerate={isStaff || isHost || isCoHost}
                  isHost={isHost}
                >
                  <RoomChat
                    hostId={hostId}
                    currentUserId={userId}
                    currentUserName={userName}
                    currentUserAvatar={userAvatar}
                    canWriteChat={canWriteChat}
                    planKey={planKey}
                  />
                </RoomDataProvider>
              </div>
            </div>
          )}

          {!showChat && (
            <button
              type="button"
              className={styles.chatFab}
              onClick={() => setShowChat(true)}
              aria-label={t("showChat")}
              title={t("showChat")}
            >
              <MessagesSquare size={19} />
              <span>Chat</span>
            </button>
          )}

          <div className={styles.roomActionBar}>
            <button type="button" className={`${styles.roomActionBtn} ${styles.roomActionLeave}`} onClick={handleLeave}>
              <LogOut size={18} />
              <span>{t("leave")}</span>
            </button>
          </div>
        </div>
      </div>

      {phase === "error" && roomError && (
        <div className={styles.errorOverlay}>
          <div className={styles.errorCard}>
            <h2 className={styles.errorCardTitle}>{roomError.title}</h2>
            <p className={styles.errorCardMsg}>{roomError.message}</p>
            <div className={styles.errorCardActions}>
              {roomError.retryable && (
                <button type="button" className={styles.errorCardPrimary} onClick={reconnectNow}>
                  <RefreshCcw size={15} />
                  {t("retry")}
                </button>
              )}
              <button type="button" className={styles.errorCardGhost} onClick={dismissError}>
                {t("dismiss")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );

  if (waiting) return waitScreen;
  if (phase === "idle" || phase === "authenticating") return prejoin;
  return connectedRoom;
}