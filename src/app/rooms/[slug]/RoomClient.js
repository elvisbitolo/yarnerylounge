"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { LiveKitRoom, RoomAudioRenderer, useConnectionState, useParticipants } from "@livekit/components-react";
import "@livekit/components-styles";
import BackButton from "@/components/BackButton";
import AmbientAudio from "@/components/AmbientAudio";
import RoomBackground from "@/components/RoomBackground";
import RoomMusicPicker from "@/components/RoomMusicPicker";
import RoomDataProvider, { useRoomData } from "./RoomDataProvider";
import RoomStage from "./RoomStage";
import RoomChat from "./RoomChat";
import RoomControls from "./RoomControls";
import ParticipantPanel from "./ParticipantPanel";
import RoomPreJoin from "./RoomPreJoin";
import styles from "./room.module.css";

function currentTime() {
  return Date.now();
}

function ConnectionStatus() {
  const t = useTranslations("rooms");
  const state = useConnectionState();
  const label =
    state === "connected"
      ? ""
      : state === "connecting" || state === "reconnecting"
      ? t("reconnecting")
      : state === "disconnected"
      ? t("disconnected")
      : "";
  if (!label) return null;
  return (
    <div className={styles.connectionStatus}>
      <span className={styles.connectionDot} data-state={state} />
      {label}
    </div>
  );
}

function LiveViewerCount() {
  const t = useTranslations("rooms");
  const participants = useParticipants();
  return (
    <span className={styles.liveViewers}>
      <span className={styles.liveDot} aria-hidden="true" />
      {t("live")} · {t("watchingCount", { count: participants.length })}
    </span>
  );
}

function RoomPopulation({ onChange }) {
  const participants = useParticipants();
  useEffect(() => {
    onChange(participants.length);
  }, [participants.length, onChange]);
  return null;
}

function SpeakerInviteDialog({ onAccept, onDecline }) {
  const t = useTranslations("rooms");
  const { speakerInvite, clearSpeakerInvite } = useRoomData();
  if (!speakerInvite) return null;
  return (
    <div className={styles.inviteBackdrop} onClick={() => { clearSpeakerInvite(); onDecline(); }}>
      <div className={styles.inviteDialog} onClick={(e) => e.stopPropagation()}>
        <h4 className={styles.inviteTitle}>{t("speakerInviteTitle")}</h4>
        <p className={styles.inviteCopy}>
          {t("speakerInviteCopy", { host: speakerInvite.hostName })}
        </p>
        <div className={styles.inviteActions}>
          <button
            type="button"
            className={styles.inviteAccept}
            onClick={() => { clearSpeakerInvite(); onAccept(); }}
          >
            {t("acceptSpeaker")}
          </button>
          <button
            type="button"
            className={styles.inviteDecline}
            onClick={() => { clearSpeakerInvite(); onDecline(); }}
          >
            {t("decline")}
          </button>
        </div>
      </div>
    </div>
  );
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
  vibe = "",
  musicUrl,
  musicPlaying,
  musicFileId,
  hostId = "",
  userId = "",
  userName = "Member",
  userAvatar = "",
}) {
  const router = useRouter();
  const t = useTranslations("rooms");
  const [token, setToken] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const [joinPrefs, setJoinPrefs] = useState(null);
  const [isViewer, setIsViewer] = useState(false);
  const [now, setNow] = useState(() => currentTime());
  const [statusMsg, setStatusMsg] = useState("");
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [participantCount, setParticipantCount] = useState(0);

  const tokenRef = useRef("");
  const reconnectTimer = useRef(null);
  const refreshTimer = useRef(null);
  const reconnectCountRef = useRef(0);

  const MAX_RECONNECTS = 5;

  useEffect(() => {
    const timer = setInterval(() => setNow(currentTime()), 1000);
    return () => clearInterval(timer);
  }, []);

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

  const isBroadcast = kind === "broadcast";
  const isOwner = role === "owner";
  const isStaff = role === "owner" || role === "moderator";
  const isModerator = role === "moderator";
  const viewerOnly = isBroadcast && !isHost && !isCoHost;
  const planCanPublish = canPublishPlan || isStaff || isHost || isCoHost;
  const canWriteChat = canWriteChatPlan || isStaff || isHost || isCoHost;
  const waiting = Boolean(opensAt) && !isHost && now < opensAt;
  const waitSeconds = waiting ? Math.max(0, Math.ceil((opensAt - now) / 1000)) : 0;

  function formatWait(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  async function fetchToken() {
    const res = await fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (res.status === 401) {
      router.push("/login");
      return null;
    }
    if (res.status === 403) {
      router.push("/rooms");
      return null;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to join room");
    return data;
  }

  function scheduleRefresh(expiresInSeconds) {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const refreshAt = Math.max(60, (expiresInSeconds || 3600) * 0.75) * 1000;
    refreshTimer.current = setTimeout(async () => {
      try {
        const data = await fetchToken();
        if (data) {
          setToken(data.token);
          tokenRef.current = data.token;
          scheduleRefresh(expiresInSeconds);
        }
      } catch {
        scheduleRefresh(expiresInSeconds);
      }
    }, refreshAt);
  }

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  async function handleJoin(prefs) {
    setBusy(true);
    setError("");
    try {
      const data = await fetchToken();
      if (!data) return;
      setToken(data.token);
      tokenRef.current = data.token;
      setServerUrl(data.serverUrl);
      const tokenViewer = data.kind === "broadcast" && data.canPublish === false;
      const planViewer = data.canPublish === false;
      setIsViewer(tokenViewer || planViewer);
      setJoinPrefs(
        prefs || {
          micOn: planCanPublish ? true : false,
          camOn: planCanPublish ? true : false,
          audioDeviceId: "",
          videoDeviceId: "",
        }
      );
      setJoined(true);
      reconnectCountRef.current = 0;
      scheduleRefresh(alwaysOn ? 86400 : 14400);
      onAuthStateChanged(auth, (user) => {
        if (user && roomId) {
          addDoc(collection(db, "roomEvents"), {
            userId: user.uid,
            roomId,
            roomName,
            joinedAt: new Date(),
          }).catch(() => {});
        }
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleDisconnect() {
    if (!alwaysOn) {
      router.push("/rooms");
      return;
    }
    if (reconnectCountRef.current >= MAX_RECONNECTS) {
      setStatusMsg("This room is no longer active.");
      return;
    }
    setStatusMsg("Connection lost. Reconnecting…");
    const count = reconnectCountRef.current;
    const delay = Math.min(1000 * 2 ** count, 30000);
    clearTimeout(reconnectTimer.current);
    reconnectTimer.current = setTimeout(async () => {
      try {
        const data = await fetchToken();
        if (data) {
          setToken(data.token);
          tokenRef.current = data.token;
          setServerUrl(data.serverUrl);
          const reconnectViewer = data.kind === "broadcast" && data.canPublish === false;
          const reconnectPlanViewer = data.canPublish === false;
          setIsViewer(reconnectViewer || reconnectPlanViewer);
          reconnectCountRef.current = count + 1;
          setStatusMsg("");
          scheduleRefresh(alwaysOn ? 86400 : 14400);
        }
      } catch {
        reconnectCountRef.current = count + 1;
        handleDisconnect();
      }
    }, delay);
  }

  useEffect(() => {
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  async function acceptSpeakerInvite() {
    try {
      const data = await fetchToken();
      if (data) {
        setToken(data.token);
        tokenRef.current = data.token;
        setServerUrl(data.serverUrl);
        setIsViewer(data.kind === "broadcast" && data.canPublish === false);
      }
    } catch {
      /* token refresh failed — keep current session */
    }
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
          <RoomPreJoin
            roomName={roomName}
            userName={userName}
            userAvatar={userAvatar}
            subtitle={
              !planCanPublish
                ? "Viewing as a guest — upgrades unlock your camera & mic."
                : alwaysOn && vibe === "silent"
                ? "Zero-distraction zone. Cameras on, microphones muted — absolute silence for your focus."
                : alwaysOn && vibe === "focus"
                ? "Solo-focused flow. Microphones muted by default, text chat for quick hellos."
                : alwaysOn
                ? "Always open — pop in anytime. Meet new members and settle into the lounge."
                : isBroadcast
                ? "This is a live broadcast. Join to watch the stream."
                : "Get ready, then join the live room."
            }
            joinLabel={
              busy ? undefined : alwaysOn ? "Pop in" : isBroadcast ? "Join as viewer" : "Join room"
            }
            busy={busy}
            error={error}
            viewerOnly={viewerOnly || !planCanPublish}
            micDefaultOn={vibe !== "silent" && vibe !== "focus"}
            onJoin={(prefs) => handleJoin(prefs)}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <RoomBackground show={alwaysOn} musicActive={!!musicPlaying} autoplaySound={joined} />
      <div className={styles.roomWrap} style={{ position: "relative" }}>
        <AmbientAudio
          active={alwaysOn}
          roomId={roomId}
          musicUrl={musicUrl}
          musicPlaying={musicPlaying}
          musicFileId={musicFileId}
          hasVideoBackdrop={alwaysOn}
          pauseWhenBusy={participantCount > 1}
        />
        {alwaysOn && isStaff && <RoomMusicPicker isStaff={isStaff} roomSlug={slug} />}
        {statusMsg && (
          <div className={styles.reconnectBanner}>
            <span>{statusMsg}</span>
            {statusMsg === "This room is no longer active." && (
              <button
                type="button"
                className={styles.reconnectBack}
                onClick={() => router.push("/rooms")}
              >
                Back to rooms
              </button>
            )}
          </div>
        )}
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={true}
          video={joinPrefs ? joinPrefs.camOn : true}
          audio={joinPrefs ? joinPrefs.micOn : true}
          options={{
            adaptiveStream: true,
            dynacast: true,
            disconnectOnPageLeave: false,
            expWebsocketTimeout: 15000,
            ...(joinPrefs && {
              videoCaptureDefaults: joinPrefs.camOn
                ? { deviceId: joinPrefs.videoDeviceId || undefined }
                : undefined,
              audioCaptureDefaults: joinPrefs.micOn
                ? { deviceId: joinPrefs.audioDeviceId || undefined }
                : undefined,
            }),
          }}
          onDisconnected={handleDisconnect}
        >
          <RoomDataProvider
            roomId={roomId}
            hostId={hostId}
            currentUserId={userId}
            currentUserName={userName}
            currentUserAvatar={userAvatar}
            canModerate={isStaff || isHost || isCoHost}
            isHost={isHost}
          >
            <RoomPopulation onChange={setParticipantCount} />
            <div className={styles.liveRoom}>
              <header className={styles.roomHeader}>
                <div className={styles.roomHeaderCopy}>
                  <h1 className={styles.roomHeaderTitle}>{roomName}</h1>
                  <p className={styles.roomHeaderDesc}>
                    {isBroadcast ? "Live broadcast to the community" : "A live gathering with the community"}
                  </p>
                </div>
                <div className={styles.roomHeaderMeta}>
                  <ConnectionStatus />
                  <LiveViewerCount />
                  {(isHost || (isBroadcast ? !isViewer : true)) && (
                    <span className={styles.recordChip}>
                      <span className={styles.recordDot} aria-hidden="true" /> REC
                    </span>
                  )}
                </div>
              </header>

              <div className={styles.mainRow}>
                <div className={styles.stageCol}>
                  <RoomStage
                    hostId={hostId}
                    currentUserId={userId}
                    currentUserAvatar={userAvatar}
                  />
                  {isViewer && (
                    <span className={styles.viewerBanner} role="status">
                      {t("watchingBanner")}
                    </span>
                  )}
                </div>
              </div>

              <RoomControls
                isHost={isHost}
                canPublish={planCanPublish && !isViewer}
                currentUserName={userName}
                chatOpen={showChat}
                participantsOpen={showParticipants}
                onOpenParticipants={() => setShowParticipants((v) => !v)}
                onOpenChat={() => setShowChat((v) => !v)}
                onLeave={() => router.push("/rooms")}
              />

              {showChat && (
                <section className={styles.chatBottom}>
                  <RoomChat
                    hostId={hostId}
                    currentUserId={userId}
                    currentUserName={userName}
                    currentUserAvatar={userAvatar}
                    canWriteChat={canWriteChat}
                    planKey={planKey}
                  />
                </section>
              )}
            </div>

            {showParticipants && (
              <ParticipantPanel
                hostId={hostId}
                roomId={roomId}
                currentUserId={userId}
                currentUserName={userName}
                isHost={isHost}
                isCoHost={isCoHost}
                onClose={() => setShowParticipants(false)}
              />
            )}

            <SpeakerInviteDialog onAccept={acceptSpeakerInvite} onDecline={() => {}} />
          </RoomDataProvider>
          <RoomAudioRenderer />
        </LiveKitRoom>
      </div>
    </main>
  );
}
