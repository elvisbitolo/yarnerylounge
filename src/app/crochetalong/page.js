import { redirect } from "next/navigation";
import { Play, FileText, Timer, Sparkles } from "lucide-react";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { CROCHET_ALONGS } from "@/lib/crochet-alongs";
import Nav from "@/components/Nav";
import styles from "./crochetalong.module.css";

export const dynamic = "force-dynamic";

function youtubeThumb(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}

export default async function CrochetAlongPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const userDoc = await getUserDoc(user.uid);

  return (
    <Nav role={userDoc?.role}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Crochet Alongs</h1>
          <span className={styles.badge}>
            <Sparkles size={12} />
            New tutorials
          </span>
        </header>
        <p className={styles.subtitle}>
          Grab your hook and follow along with me — stitch-by-stitch tutorials for every level, from your first magic
          ring to finishing touches.
        </p>

        {CROCHET_ALONGS.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.soonTick}>✦</div>
            <p>
              The first crochet-along is being filmed and will land here soon.
              <br />
              Check back to grow your skills with me.
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {CROCHET_ALONGS.map((tutorial) => {
              const thumb = youtubeThumb(tutorial.videoUrl);
              return (
                <article key={tutorial.slug} className={styles.card}>
                  {tutorial.videoUrl && (
                    <a
                      href={tutorial.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Watch ${tutorial.title}`}
                      className={styles.media}
                    >
                      {thumb ? (
                        <img src={thumb} alt="" className={styles.mediaImg} />
                      ) : (
                        <div className={styles.mediaFallback}>{tutorial.title}</div>
                      )}
                      <span className={styles.playBadge}>
                        <span className={styles.playDot}>
                          <Play size={20} fill="currentColor" />
                        </span>
                      </span>
                    </a>
                  )}
                  <h2 className={styles.cardTitle}>{tutorial.title}</h2>
                  <p className={styles.cardDesc}>{tutorial.description}</p>
                  <div className={styles.meta}>
                    {tutorial.duration && (
                      <span className={styles.duration}>
                        <Timer size={12} /> {tutorial.duration}
                      </span>
                    )}
                    {(tutorial.materials || []).map((material) => (
                      <span key={material} className={styles.material}>
                        {material}
                      </span>
                    ))}
                  </div>
                  <div className={styles.actions}>
                    {tutorial.videoUrl && (
                      <a
                        href={tutorial.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.watchBtn}
                      >
                        <Play size={14} fill="currentColor" /> Watch tutorial
                      </a>
                    )}
                    {tutorial.pdfUrl && (
                      <a href={tutorial.pdfUrl} target="_blank" rel="noopener noreferrer" className={styles.pdfBtn}>
                        <FileText size={14} /> Printable pattern
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Nav>
  );
}