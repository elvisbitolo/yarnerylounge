"use client";

import { useState } from "react";
import { useParticipants, useSpeakingParticipants, VideoTrack, useTrackByName } from "@livekit/components-react";
import { useTranslations } from "next-intl";
import { Track } from "livekit-client";
import { Mic, MicOff, Hand, Music4, VideoOff, Users } from "lucide-react";
import { useRoomData } from "./RoomDataProvider";
import { parsePersonMeta } from "./personMeta";
import styles from "./room.module.css";

function VideoTile({ participant, speaking }) {
  const trackRef = useTrackByName(Track.Source.Camera, participant);
  const hasVideo = trackRef?.publication?.track;
  return (
    <div className={styles.tileVideo}>
      {hasVideo ? (
        <VideoTrack trackRef={trackRef} className={styles.tileVideoEl} />
      ) : (
        <span className={styles.tileVideoPlaceholder}>
          {(participant.name || participant.identity || "?").charAt(0).toUpperCase()}
        </span>
      )}
      {speaking && <span className={styles.tileSpeakingRing} aria-hidden="true" />}
    </div>
  );
}

function OffCamTile({ participant, isMe, currentUserAvatar }) {
  const [broken, setBroken] = useState(false);
  const meta = parsePersonMeta(participant);
  const avatar = isMe ? currentUserAvatar || meta.avatar || participant.avatar : meta.avatar || participant.avatar;
  return (
    <div className={styles.tileOffCamArea}>
      {avatar && !broken && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.tileAvatarImg} src={avatar} alt="" onError={() => setBroken(true)} />
      )}
      {(!avatar || broken) && (
        <span className={styles.tileAvatarLetter}>
          {(meta.name || participant.name || participant.identity || "?").charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function galleryColumns(count) {
  // Google Meet style: 1 = full-screen, 2-4 = 2x2, 5+ = 3x3 grid.
  if (count <= 1) return styles.gridOne;
  if (count <= 4) return styles.gridTwo;
  return styles.gridThree;
}

export default function RoomStage({ hostId, currentUserId, currentUserAvatar = "" }) {
  const t = useTranslations("rooms");
  const participants = useParticipants();
  const speakers = useSpeakingParticipants();
  const { raisedHands, floatingReactions } = useRoomData();

  const speakerIds = new Set(speakers.map((p) => p.identity));
  const count = participants.length;

  return (
    <div className={styles.stageGallery}>
      <div className={[styles.stageGrid, galleryColumns(count)].join(" ")}>
        {count === 0 && (
          <div className={styles.stageEmpty} role="status">
            <Music4 size={28} />
            <p>{t("waitingForStitchers")}</p>
          </div>
        )}
        {count === 1 && (
          <div className={styles.stageSelfOnly} role="status">
            {(() => {
              const p = participants[0];
              const isMe = p.identity === currentUserId;
              const isActive = speakerIds.has(p.identity);
              const isHostUser = p.identity === hostId;
              const meta = parsePersonMeta(p);
              const isPub = p.permissions ? p.permissions.canPublish !== false : true;
              const showVideo = isPub && p.isCameraEnabled !== false;
              return (
                <div
                  key={p.identity}
                  className={[
                    styles.tile,
                    isActive ? styles.tileActive : "",
                    isMe ? styles.tileMe : "",
                    !showVideo ? styles.tileOffCam : "",
                    showVideo ? styles.tileCamOn : "",
                  ].filter(Boolean).join(" ")}
                >
                  {showVideo ? (
                    <VideoTile participant={p} speaking={isActive} />
                  ) : (
                    <OffCamTile participant={p} isMe={isMe} currentUserAvatar={currentUserAvatar} />
                  )}
                  <div className={styles.tileFooter}>
                    <span className={styles.tileName}>
                      {meta.name || p.name || p.identity}
                      {isMe && <span className={styles.tileYou}>{t("you")}</span>}
                      {isHostUser && <span className={styles.tileHostBadge}>{t("host")}</span>}
                    </span>
                    <span
                      className={p.isMicrophoneEnabled === false ? `${styles.tileMic} ${styles.tileMicOff}` : styles.tileMic}
                      title={p.isMicrophoneEnabled === false ? t("muted") : t("micOn")}
                    >
                      {p.isMicrophoneEnabled === false ? <MicOff size={14} /> : <Mic size={14} />}
                    </span>
                  </div>
                  {isActive && (
                    <span className={styles.tileSpeaking} aria-live="polite">
                      {t("speaking")}
                    </span>
                  )}
                </div>
              );
            })()}
            <div className={styles.waitingStitchers}>
              <Music4 size={20} />
              <p>{t("waitingForStitchers")}</p>
            </div>
          </div>
        )}
        {count >= 2 &&
          participants.map((p) => {
            const isMe = p.identity === currentUserId;
            const isActive = speakerIds.has(p.identity);
            const isHostUser = p.identity === hostId;
            const handRaised = !!raisedHands[p.identity];
            const meta = parsePersonMeta(p);
            const isPub = p.permissions ? p.permissions.canPublish !== false : true;
            const showVideo = isPub && p.isCameraEnabled !== false;
            return (
              <div
                key={p.identity}
                className={[
                  styles.tile,
                  isActive ? styles.tileActive : "",
                  isMe ? styles.tileMe : "",
                  !showVideo ? styles.tileOffCam : "",
                  showVideo ? styles.tileCamOn : "",
                ].filter(Boolean).join(" ")}
              >
                {showVideo ? (
                  <VideoTile participant={p} speaking={isActive} />
                ) : (
                  <OffCamTile participant={p} isMe={isMe} currentUserAvatar={currentUserAvatar} />
                )}
                <div className={styles.tileFooter}>
                  <span className={styles.tileName}>
                    {meta.name || p.name || p.identity}
                    {isMe && <span className={styles.tileYou}>{t("you")}</span>}
                    {isHostUser && <span className={styles.tileHostBadge}>{t("host")}</span>}
                  </span>
                  <span
                    className={p.isMicrophoneEnabled === false ? `${styles.tileMic} ${styles.tileMicOff}` : styles.tileMic}
                    title={p.isMicrophoneEnabled === false ? t("muted") : t("micOn")}
                  >
                    {p.isMicrophoneEnabled === false ? <MicOff size={14} /> : <Mic size={14} />}
                  </span>
                </div>
                {handRaised && (
                  <span className={styles.tileHand}>
                    <Hand size={14} />
                    {t("raisedHand")}
                  </span>
                )}
                {!showVideo && p.isCameraEnabled === false && (
                  <span className={styles.tileCamOff}>
                    <VideoOff size={14} /> {t("cameraOff")}
                  </span>
                )}
                {isActive && (
                  <span className={styles.tileSpeaking} aria-live="polite">
                    {t("speaking")}
                  </span>
                )}
              </div>
            );
          })}
      </div>

      <div className={styles.galleryCount} title={t("peopleInRoom", { count })}>
        <Users size={14} />
        <span>{count}</span>
      </div>

      <div className={styles.reactionsLayer} aria-hidden="true">
        {floatingReactions.slice(-6).map((r) => (
          <span key={r.id} className={r.sent ? `${styles.floatReaction} ${styles.floatReactionSelf}` : styles.floatReaction}>
            {r.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}