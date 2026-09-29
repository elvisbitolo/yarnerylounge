"use client";

import { useEffect, useRef } from "react";
import styles from "./RoomBackground.module.css";

const SRC = "/videos/elivs-bg.mp4";

export default function RoomBackground({ show, musicActive }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!show) return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.play().catch(() => {});
  }, [show]);

  useEffect(() => {
    if (musicActive && videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.pause();
    }
  }, [musicActive]);

  if (!show) return null;

  return (
    <video
      ref={videoRef}
      className={styles.video}
      src={SRC}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden="true"
    />
  );
}
