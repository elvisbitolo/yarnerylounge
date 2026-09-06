"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParticipants } from "@livekit/components-react";
import {
  MicOff,
  Hand,
  UserPlus,
  UserMinus,
  X,
  Search,
  VideoOff,
  ShieldCheck,
} from "lucide-react";
import { useRoomData } from "./RoomDataProvider";
import { parsePersonMeta } from "./personMeta";
import styles from "./room.module.css";

function PanelAvatar({ name, avatar }) {
  const [broken, setBroken] = useState(false);
  if (avatar && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.panelAvatarImg} src={avatar} alt="" onError={() => setBroken(true)} />;
  }
  return <span className={styles.panelAvatar}>{(name || "?").charAt(0).toUpperCase()}</span>;
}

export default function ParticipantPanel({ hostId, roomId, currentUserId, currentUserName = "Host", isHost, isCoHost, onClose }) {
  const t = useTranslations("rooms");
  const participants = useParticipants();
  const { raisedHands, dismissHand, sendSpeakerInvite } = useRoomData();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [actionError, setActionError] = useState("");

  const q = query.trim().toLowerCase();
  const withMeta = (p) => {
    const meta = parsePersonMeta(p);
    return { p, name: meta.name || p.name || p.identity };
  };
  const filtered = participants
    .map(withMeta)
    .filter(({ name: n }) => !q || n.toLowerCase().includes(q))
    .map(({ p }) => p);

  const maxSpeakers = 9;
  const speakerCount = participants.filter(
    (p) => (p.permissions ? p.permissions.canPublish !== false : true)
  ).length;
  const roomFull = speakerCount >= maxSpeakers;

  const hostUsers = filtered.filter((p) => p.identity === hostId);
  const speakerUsers = filtered.filter(
    (p) => p.identity !== hostId && (p.permissions ? p.permissions.canPublish !== false : true)
  );
  const viewerUsers = filtered.filter(
    (p) => p.identity !== hostId && (p.permissions ? p.permissions.canPublish === false : false)
  );

  const raisedQueue = Object.entries(raisedHands)
    .filter(([, v]) => v)
    .map(([id]) => id);

  async function performAction(identity, action) {
    setBusyId(identity);
    setMenuFor(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/participants/${encodeURIComponent(identity)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || "Could not update participant");
      }
      if (res.ok && action === "speaker") {
        sendSpeakerInvite(identity, currentUserName);
      }
    } catch {
      setActionError("Could not update participant");
    } finally {
      setBusyId(null);
    }
  }

  function ActionsMenu({ p, identity }) {
    const isHostUser = identity === hostId;
    if (!(isHost || isCoHost) || isHostUser) return null;
    const previewsSpeaker = p.permissions?.canPublish === false;
    const promoteBlocked = previewsSpeaker && roomFull;
    return (
      <div className={styles.panelActions}>
        <button
          type="button"
          className={styles.panelRowBtn}
          onClick={() => performAction(identity, "mute")}
          disabled={busyId === identity}
          title={t("muteParticipant")}
        >
          <MicOff size={13} /> {t("muteParticipant")}
        </button>
        <button
          type="button"
          className={styles.panelRowBtn}
          onClick={() => performAction(identity, "speaker")}
          disabled={busyId === identity || promoteBlocked}
          title={promoteBlocked ? t("stageFull") : ""}
        >
          <UserPlus size={13} /> {previewsSpeaker ? t("inviteToSpeak") : t("makeSpeaker")}
        </button>
        <button
          type="button"
          className={styles.panelRowBtn}
          onClick={() => performAction(identity, "viewer")}
          disabled={busyId === identity}
        >
          <UserMinus size={13} /> {t("makeViewer")}
        </button>
        <button
          type="button"
          className={`${styles.panelRowBtn} ${styles.panelRowBtnDanger}`}
          onClick={() => performAction(identity, "remove")}
          disabled={busyId === identity}
        >
          <X size={13} /> {t("removeParticipant")}
        </button>
      </div>
    );
  }

  function Row({ p }) {
    const isMe = p.identity === currentUserId;
    const isHostUser = p.identity === hostId;
    const handRaised = !!raisedHands[p.identity];
    const meta = parsePersonMeta(p);
    const name = meta.name || p.name || p.identity;
    return (
      <div className={styles.panelRow}>
        <PanelAvatar name={name} avatar={meta.avatar || p.avatar} />
        <div className={styles.panelRowMain}>
          <span className={styles.panelRowName}>
            {name}
            {isMe && <span className={styles.panelRowMe}>{t("you")}</span>}
          </span>
          <span className={styles.panelRowMeta}>
            {isHostUser ? (
              <span className={styles.panelRoleHost}>
                <ShieldCheck size={11} /> {t("host")}
              </span>
            ) : p.permissions?.canPublish === false ? (
              <span className={styles.panelRoleViewer}>{t("viewer")}</span>
            ) : (
              <span className={styles.panelRoleSpeaker}>{t("speaker")}</span>
            )}
            {handRaised && (
              <span className={styles.panelHand}>
                <Hand size={11} /> {t("raisedHand")}
              </span>
            )}
            {p.isMicrophoneEnabled === false && (
              <span className={styles.panelMicOff}>
                <MicOff size={12} />
              </span>
            )}
            {p.isCameraEnabled === false && (
              <span className={styles.panelCamOff}>
                <VideoOff size={12} />
              </span>
            )}
          </span>
        </div>
        <ActionsMenu p={p} identity={p.identity} />
      </div>
    );
  }

  return (
    <div className={styles.dialogBackdrop} onClick={onClose}>
      <div className={styles.participantPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>
            {t("peopleInRoomTitle")}
            <span className={styles.panelCount}>{participants.length}</span>
          </h3>
          {(isHost || isCoHost) && (
            <span className={styles.stageCount}>
              {t("stageCount", { count: speakerCount, max: maxSpeakers })}
            </span>
          )}
          <button type="button" className={styles.panelClose} onClick={onClose} aria-label={t("close")}>
            <X size={18} />
          </button>
        </div>

        {actionError && (
          <p className={styles.panelError} role="alert">
            {actionError}
          </p>
        )}
        {roomFull && (isHost || isCoHost) && (
          <p className={styles.panelWarning}>{t("stageFull")}</p>
        )}

        <div className={styles.panelSearch}>
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchParticipants")}
            aria-label={t("searchParticipants")}
          />
        </div>

        {raisedQueue.length > 0 && (isHost || isCoHost) && (
          <div className={styles.raisedPanel}>
            <p className={styles.raisedTitle}>
              <Hand size={13} /> {t("raisedHands")}
            </p>
            {raisedQueue.map((id, idx) => {
              const p = participants.find((x) => x.identity === id);
              const raisedName = p ? parsePersonMeta(p).name || p.name || id : id;
              return (
                <div key={id} className={styles.raisedRow}>
                  <span className={styles.raisedIdx}>{idx + 1}.</span>
                  <span className={styles.raisedName}>{raisedName}</span>
                  <button
                    type="button"
                    className={styles.raisedBtn}
                    onClick={() => performAction(id, "speaker")}
                    disabled={roomFull}
                    title={roomFull ? t("stageFull") : ""}
                  >
                    {t("inviteToSpeak")}
                  </button>
                  <button
                    type="button"
                    className={`${styles.raisedBtn} ${styles.raisedBtnGhost}`}
                    onClick={() => dismissHand(id)}
                  >
                    {t("dismiss")}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {hostUsers.length > 0 && (
          <p className={styles.panelGroup}>{t("host")}</p>
        )}
        {hostUsers.map((p) => (
          <Row key={p.identity} p={p} />
        ))}

        {speakerUsers.length > 0 && <p className={styles.panelGroup}>{t("speakers")}</p>}
        {speakerUsers.map((p) => (
          <Row key={p.identity} p={p} />
        ))}

        {viewerUsers.length > 0 && <p className={styles.panelGroup}>{t("participants")}</p>}
        {viewerUsers.map((p) => (
          <Row key={p.identity} p={p} />
        ))}

        {filtered.length === 0 && <p className={styles.panelEmpty}>{t("noParticipants")}</p>}
      </div>
    </div>
  );
}
