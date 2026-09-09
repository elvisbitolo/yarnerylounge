"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { JaaSMeeting } from "@jitsi/react-sdk";
import { LogOut, MessagesSquare } from "lucide-react";
import BackButton from "@/components/BackButton";
import AmbientAudio from "@/components/AmbientAudio";
import RoomBackground from "@/components/RoomBackground";
import RoomMusicPicker from "@/components/RoomMusicPicker";
import RoomDataProvider from "./RoomDataProvider";
import RoomChat from "./RoomChat";
import styles from "./room.module.css";

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

  const [token, setToken] = useState("");
  const [jitsiRoom, setJitsiRoom] = useState("");
  const [jitsiAppId, setJitsiAppId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [participantCount, setParticipantCount] = useState(0);
  const [showChat, setShowChat] = useState(true);

  const apiRef = useRef(null);
  const tileForcedRef = useRef(false);
  const joinedRef = useRef(false);

  const isBroadcast = kind === "broadcast";
  const isStaff = role === "owner" || role === "moderator";
  const viewerOnly = isBroadcast && !isHost && !isCoHost;
  const planCanPublish = canPublishPlan || isStaff || isHost || isCoHost;
  const canWriteChat = canWriteChatPlan || isStaff || isHost || isCoHost;
  const viewer = !planCanPublish || viewerOnly;
  const audioLocked = disableAudio || forceMuteOnJoin;

  // Always-on lounges are joinable any time; only scheduled (non-alwaysOn)
  // rooms gate on the next upcoming start for non-hosts.
  const waiting = !alwaysOn && Boolean(opensAt) && !isHost && now < opensAt;
  const waitSeconds = waiting ? Math.max(0, Math.ceil((opensAt - now) / 1000)) : 0;

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

  async function handleJoin() {
    setBusy(true);
    setError("");
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
      if (!res.ok) throw new Error(data.error || "Failed to join room");
      setToken(data.token);
      setJitsiRoom(data.roomName);
      setJitsiAppId(data.appId || "");
      setJoined(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!joined || joinedRef.current) return;
    joinedRef.current = true;
  }, [joined]);

  function handleApiReady(api) {
    apiRef.current = api;
    const syncCount = () => {
      try {
        setParticipantCount(api.getParticipantsInfo()?.length || 0);
      } catch {
        /* not ready yet */
      }
    };
    api.addEventListener("participantJoined", syncCount);
    api.addEventListener("participantLeft", syncCount);
    api.addEventListener("videoConferenceJoined", syncCount);
    syncCount();

    // Gallery view by default: correct Jitsi once if it lands on stage/film view.
    api.addEventListener("tileViewChanged", ({ visible }) => {
      if (!visible && !tileForcedRef.current) {
        tileForcedRef.current = true;
        api.executeCommand("toggleTileView");
      }
    });
  }

  function handleLeave() {
    try {
      apiRef.current?.executeCommand("hangup");
    } catch {
      /* already gone */
    }
    router.push("/rooms");
  }

  if (waiting) {
    return (
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
  }

  if (!joined) {
    return (
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
              {viewer && <p className={styles.watchNote}>{t("watchingOnly")}</p>}
              {audioLocked && !viewer && (
                <p className={styles.watchNote}>
                  🔇 Audio is always off in this room — cameras stay on for company.
                </p>
              )}
              {raiseHandToTalk && !viewer && (
                <p className={styles.watchNote}>
                  🙋 Raise your hand to talk — the host will invite you to speak.
                </p>
              )}
              {error && <p className={styles.error}>{error}</p>}
              <button
                className={styles.join}
                onClick={handleJoin}
                disabled={busy}
              >
                {busy ? t("joining") : alwaysOn ? "Pop in" : isBroadcast ? "Join as viewer" : "Join room"}
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
  }

  const configOverwrite = {
    prejoinConfig: { enabled: false },
    enableClosePage: false,
    disableInviteFunctions: true,
    disableProfile: !isStaff,
    channelLastN: -1,
    tileView: { enabled: true, maxColumns: 4 },
    startWithAudioMuted: viewer || audioLocked,
    startWithVideoMuted: viewer,
    startAudioMuted: viewer || audioLocked,
    startVideoMuted: viewer,
    toolbarButtons:
      viewer || audioLocked ? VIEWER_TOOLBAR : undefined,
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

  return (
    <main className={styles.page}>
      <RoomBackground show={alwaysOn} musicActive={!!musicPlaying} autoplaySound={joined} />
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
              {(isHost || (isBroadcast ? !viewer : true)) && (
                <span className={styles.recordChip}>
                  <span className={styles.recordDot} aria-hidden="true" /> REC
                </span>
              )}
            </div>
          </header>

          <div className={styles.jitsiStage}>
            <JaaSMeeting
              appId={jitsiAppId}
              roomName={jitsiRoom}
              jwt={token}
              userInfo={{ displayName: userName, email: userEmail }}
              configOverwrite={configOverwrite}
              interfaceConfigOverwrite={interfaceConfigOverwrite}
              onApiReady={handleApiReady}
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
    </main>
  );
}