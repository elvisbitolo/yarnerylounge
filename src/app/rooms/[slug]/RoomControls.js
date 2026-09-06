"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useLocalParticipant } from "@livekit/components-react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Hand,
  SmilePlus,
  Users,
  MessageCircle,
  Settings,
  MoreHorizontal,
  LogOut,
  Captions,
  Maximize,
  Volume2,
  SwitchCamera,
} from "lucide-react";
import { useRoomData } from "./RoomDataProvider";
import styles from "./room.module.css";

const REACTION_EMOJI = ["❤️", "👍", "👏", "🎉", "😂", "🙌"];

function TooltipBtn({ title, className, onClick, children, active }) {
  return (
    <button
      type="button"
      className={[styles.ctrlBtn, className || "", active ? styles.ctrlActive : ""].filter(Boolean).join(" ")}
      onClick={onClick}
      aria-label={title}
      title={title}
    >
      {children}
    </button>
  );
}

export default function RoomControls({
  isHost,
  canPublish = true,
  disableAudio = false,
  vibeRule = "",
  onOpenParticipants,
  onOpenChat,
  onLeave,
  chatOpen,
  participantsOpen,
  currentUserName = "",
}) {
  const t = useTranslations("rooms");
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const { myHandRaised, toggleHand, sendReaction } = useRoomData();
  const [showReactions, setShowReactions] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [devices, setDevices] = useState({ audio: [], video: [] });
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const reactionsRef = useRef(null);
  const recognitionRef = useRef(null);
  const captionsOnRef = useRef(false);

  useEffect(() => {
    captionsOnRef.current = captionsOn;
  }, [captionsOn]);

  const captionsSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function toggleMic() {
    if (disableAudio) return;
    if (localParticipant && typeof localParticipant.setMicrophoneEnabled === "function") {
      localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    }
  }
  function toggleCam() {
    if (localParticipant && typeof localParticipant.setCameraEnabled === "function") {
      localParticipant.setCameraEnabled(!isCameraEnabled);
    }
  }
  function toggleScreen() {
    if (localParticipant && typeof localParticipant.setScreenShareEnabled === "function") {
      localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    }
  }

  function changeMicDevice(deviceId) {
    if (localParticipant && typeof localParticipant.setMicrophoneEnabled === "function" && deviceId) {
      localParticipant.setMicrophoneEnabled(isMicrophoneEnabled, { deviceId });
    }
  }
  function changeCamDevice(deviceId) {
    if (localParticipant && typeof localParticipant.setCameraEnabled === "function" && deviceId) {
      localParticipant.setCameraEnabled(isCameraEnabled, { deviceId });
    }
  }

  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch {
      /* fullscreen unavailable */
    }
  }

  function cycleCamera() {
    const list = devices.video;
    if (!list.length) return;
    const current = localParticipant?.cameraTrack?.mediaStreamTrack?.getSettings?.().deviceId || "";
    const idx = list.findIndex((d) => d.deviceId === current);
    const next = list[(idx + 1) % list.length];
    changeCamDevice(next?.deviceId);
  }

  function toggleCaptions() {
    if (!captionsSupported) return;
    if (captionsOnRef.current) {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      captionsOnRef.current = false;
      setCaptionsOn(false);
      setCaptionText("");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) final = e.results[i][0].transcript;
      }
      if (final) {
        setCaptionText(final);
      }
    };
    rec.onerror = () => {
      if (captionsOnRef.current) {
        setCaptionsOn(false);
      }
    };
    rec.onend = () => {
      if (captionsOnRef.current) {
        try {
          rec.start();
        } catch {
          /* ignore */
        }
      }
    };
    try {
      rec.start();
    } catch {
      setCaptionsOn(false);
      return;
    }
    recognitionRef.current = rec;
    captionsOnRef.current = true;
    setCaptionsOn(true);
  }

  useEffect(() => {
    if (!showSettings) return;
    let active = true;
    navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((list) => {
        if (!active) return;
        setDevices({
          audio: list.filter((d) => d.kind === "audioinput"),
          video: list.filter((d) => d.kind === "videoinput"),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [showSettings]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return (
    <div className={styles.controlsBar}>
      {vibeRule && (
        <div className={styles.vibeRuleBanner} role="note">
          <span className={styles.vibeRuleIcon} aria-hidden="true">✦</span>
          <span>{vibeRule}</span>
        </div>
      )}
      <div className={styles.controlsLeft}>
        {canPublish !== false && (
          <>
            {disableAudio ? (
              <TooltipBtn title={t("muteMic")} className={styles.ctrlDanger}>
                <MicOff size={18} />
              </TooltipBtn>
            ) : (
              <TooltipBtn title={isMicrophoneEnabled ? t("muteMic") : t("unmuteMic")} onClick={toggleMic} className={isMicrophoneEnabled ? "" : styles.ctrlDanger}>
                {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
              </TooltipBtn>
            )}
            <TooltipBtn title={isCameraEnabled ? t("turnOffCam") : t("turnOnCam")} onClick={toggleCam} className={isCameraEnabled ? "" : styles.ctrlDanger}>
              {isCameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </TooltipBtn>
            <TooltipBtn title={t("shareScreen")} onClick={toggleScreen} className={isScreenShareEnabled ? styles.ctrlActive : ""}>
              <MonitorUp size={18} />
            </TooltipBtn>
          </>
        )}
        <TooltipBtn title={t("raiseHand")} onClick={toggleHand} className={myHandRaised ? styles.ctrlActive : ""}>
          <Hand size={18} />
        </TooltipBtn>
        <div className={styles.ctrlWrap} ref={reactionsRef}>
          <TooltipBtn title={t("reactions")} onClick={() => setShowReactions((v) => !v)}>
            <SmilePlus size={18} />
          </TooltipBtn>
          {showReactions && (
            <div className={styles.reactionsPanel}>
              {REACTION_EMOJI.map((e) => (
                <button key={e} type="button" className={styles.reactionsEmoji} onClick={() => { sendReaction(e); setShowReactions(false); }}>
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.controlsRight}>
        <TooltipBtn title={t("participants")} onClick={onOpenParticipants} active={participantsOpen}>
          <Users size={18} />
        </TooltipBtn>
        <TooltipBtn title={t("chat")} onClick={onOpenChat} active={chatOpen}>
          <MessageCircle size={18} />
        </TooltipBtn>
        <TooltipBtn title={t("settings")} onClick={() => setShowSettings((v) => !v)}>
          <Settings size={18} />
        </TooltipBtn>
        <div className={styles.ctrlWrap}>
          <TooltipBtn title={t("more")} onClick={() => setShowMore((v) => !v)}>
            <MoreHorizontal size={18} />
          </TooltipBtn>
          {showMore && (
            <div className={styles.moreMenu}>
              {isHost && <p className={styles.moreMenuTitle}>{t("hostControls")}</p>}
              <button type="button" className={styles.moreItem} onClick={() => { setShowMore(false); setShowSettings(true); }}>
                <Captions size={15} /> {t("captions")}
              </button>
              <button type="button" className={styles.moreItem} onClick={toggleFullscreen}>
                <Maximize size={15} /> {t("fullscreen")}
              </button>
              {canPublish !== false && (
                <button type="button" className={styles.moreItem} onClick={toggleScreen}>
                  <MonitorUp size={15} /> {t("shareScreen")}
                </button>
              )}
              <button type="button" className={styles.moreItem} onClick={() => { setShowMore(false); setShowSettings(true); }}>
                <Volume2 size={15} /> {t("audioSettings")}
              </button>
              <button type="button" className={styles.moreItem} onClick={() => { setShowMore(false); setShowSettings(true); }}>
                <SwitchCamera size={15} /> {t("videoSettings")}
              </button>
              <div className={styles.moreDivider} />
              <button type="button" className={`${styles.moreItem} ${styles.moreDanger}`} onClick={onLeave}>
                <LogOut size={15} /> {t("leaveRoom")}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className={[styles.ctrlBtn, styles.ctrlLeave].join(" ")}
          onClick={onLeave}
          title={t("leaveRoom")}
          aria-label={t("leaveRoom")}
        >
          <LogOut size={18} />
        </button>
      </div>

      {showSettings && (
        <button type="button" className={styles.settingsBackdrop} onClick={() => setShowSettings(false)} aria-label={t("close")}>
          <div className={styles.settingsPanel} onClick={(e) => e.stopPropagation()}>
            <h4 className={styles.settingsTitle}>{t("settingsTitle")}</h4>

            <label className={styles.settingsRow}>
              <span className={styles.settingsRowIcon}>
                <Volume2 size={16} />
              </span>
              <span className={styles.settingsRowBody}>
                <span className={styles.settingsRowLabel}>{t("microphone")}</span>
                {devices.audio.length > 0 ? (
                  <select
                    className={styles.settingsSelect}
                    value={localParticipant?.audioTrack?.mediaStreamTrack?.getSettings?.().deviceId || ""}
                    onChange={(e) => changeMicDevice(e.target.value)}
                    aria-label={t("microphone")}
                  >
                    <option value="">Default</option>
                    {devices.audio.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || t("microphone")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.settingsMuted}>{t("noMicrophone")}</span>
                )}
              </span>
            </label>

            <label className={styles.settingsRow}>
              <span className={styles.settingsRowIcon}>
                <SwitchCamera size={16} />
              </span>
              <span className={styles.settingsRowBody}>
                <span className={styles.settingsRowLabel}>{t("camera")}</span>
                {devices.video.length > 0 ? (
                  <select
                    className={styles.settingsSelect}
                    value={localParticipant?.cameraTrack?.mediaStreamTrack?.getSettings?.().deviceId || ""}
                    onChange={(e) => changeCamDevice(e.target.value)}
                    aria-label={t("camera")}
                  >
                    <option value="">Default</option>
                    {devices.video.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || t("camera")}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.settingsMuted}>{t("noCamera")}</span>
                )}
              </span>
            </label>

            <button type="button" className={styles.settingsRowBtn} onClick={cycleCamera} disabled={devices.video.length < 2}>
              <SwitchCamera size={16} /> {t("switchCamera")}
            </button>

            <button
              type="button"
              className={[styles.settingsRowBtn, captionsOn ? styles.settingsRowBtnActive : ""].filter(Boolean).join(" ")}
              onClick={toggleCaptions}
              disabled={!captionsSupported}
            >
              <Captions size={16} /> {captionsOn ? t("captionsOn") : t("captions")}
              {!captionsSupported && <span className={styles.settingsUnsupported}>{t("captionsNotSupported")}</span>}
            </button>

            <button type="button" className={styles.settingsClose} onClick={() => setShowSettings(false)}>
              {t("close")}
            </button>
          </div>
        </button>
      )}

      {captionsOn && captionText && (
        <div className={styles.captionsBar} role="status" aria-live="polite">
          <Captions size={15} />
          <span className={styles.captionsFrom}>{currentUserName}</span>
          <span className={styles.captionsText}>{captionText}</span>
        </div>
      )}
    </div>
  );
}