import Link from "next/link";
import { safeBlockHref } from "@/lib/page-blocks";
import styles from "@/app/about/about.module.css";

export default function PageBlocks({ blocks = [] }) {
  return (blocks || []).map((block, index) => {
    const key = block?.id || `block-${index}`;

    if (block?.type === "heading") {
      return block.level === 1 ? (
        <h1 key={key} className={styles.title}>{block.text}</h1>
      ) : (
        <h2 key={key} className={styles.heading}>{block.text}</h2>
      );
    }

    if (block?.type === "paragraph") {
      return (
        <p key={key} className={block.lead ? styles.lead : styles.blockParagraph}>
          {block.text}
        </p>
      );
    }

    if (block?.type === "list") {
      return (
        <ul key={key} className={styles.blockList}>
          {(block.items || []).map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`}>{item}</li>
          ))}
        </ul>
      );
    }

    if (block?.type === "image") {
      const src = safeBlockHref(block.src);
      if (!src) return null;
      return (
        <figure key={key}>
          <img className={styles.blockImage} src={src} alt={block.alt || ""} loading="lazy" />
          {block.caption ? <figcaption className={styles.blockCaption}>{block.caption}</figcaption> : null}
        </figure>
      );
    }

    if (block?.type === "link") {
      const href = safeBlockHref(block.href);
      if (!href) return null;
      const internal = href.startsWith("/") && !href.startsWith("//");
      return (
        <div key={key} className={styles.cta}>
          {block.text ? <p>{block.text}</p> : null}
          {internal ? (
            <Link className={styles.ctaLink} href={href}>{block.label}</Link>
          ) : (
            <a className={styles.ctaLink} href={href} target="_blank" rel="noopener noreferrer">
              {block.label}
            </a>
          )}
        </div>
      );
    }

    return null;
  });
}
