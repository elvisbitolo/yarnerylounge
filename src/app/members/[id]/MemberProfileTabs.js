"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, FolderOpen, UserRound, Trophy, Medal } from "lucide-react";
import styles from "./profile-tabs.module.css";

const TAB_ITEMS = [
  { id: "posts", label: "Posts", Icon: MessageCircle },
  { id: "projects", label: "Projects", Icon: FolderOpen },
  { id: "about", label: "About", Icon: UserRound },
  { id: "badges", label: "Badges", Icon: Trophy },
];

export default function MemberProfileTabs({ posts = [], projects = [], about, badges = [], isSelf = false }) {
  const [active, setActive] = useState("posts");
  return (
    <section className={styles.tabsShell} aria-label="Member profile sections">
      <div className={styles.tabList} role="tablist" aria-label="Profile sections">
        {TAB_ITEMS.map(({ id, label, Icon }) => (
          <button key={id} type="button" role="tab" id={`member-tab-${id}`}
            aria-selected={active === id} aria-controls={`member-panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            className={active === id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setActive(id)}>
            <Icon size={18} aria-hidden="true" /><span>{label}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="member-panel-posts" aria-labelledby="member-tab-posts" hidden={active !== "posts"} className={styles.tabPanel}>
        <h2 className={styles.sectionTitle}>Recent posts</h2>
        {posts.length === 0 ? <p className={styles.empty}>No posts yet.</p> : <div className={styles.postList}>
          {posts.map((post) => <article key={post.id} className={styles.post}>
            <p className={styles.postText}>{post.text}</p>
            {post.imageUrl && <img src={post.imageUrl} alt="" className={styles.postImage} />}
            <p className={styles.postMeta}>{post.createdAt ? new Date(post.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : ""}</p>
          </article>)}
        </div>}
      </div>
      <div role="tabpanel" id="member-panel-projects" aria-labelledby="member-tab-projects" hidden={active !== "projects"} className={styles.tabPanel}>
        <div className={styles.projectsHeader}><h2 className={styles.sectionTitle}>Project portfolio</h2>{isSelf && <Link className={styles.projectManageLink} href="/portfolio">Manage projects</Link>}</div>
        {projects.length === 0 ? <p className={styles.empty}>{isSelf ? "Add projects to show the community what you are making." : "No projects added yet."}</p> : <div className={styles.projectGrid}>
          {projects.map((project) => <article key={project.id} className={styles.projectCard}>
            {project.imageUrls?.[0] && <img src={project.imageUrls[0]} alt="" className={styles.projectImage} />}
            <div className={styles.projectBody}><div className={styles.projectTitleRow}><h3>{project.title}</h3>{project.featured && <span className={styles.projectFeatured}>Featured</span>}</div>
              <p className={styles.projectMeta}>{[project.craft, project.projectType, project.status].filter(Boolean).join(" · ")}</p>
              {project.description && <p className={styles.projectDescription}>{project.description}</p>}
            </div>
          </article>)}
        </div>}
      </div>
      <div role="tabpanel" id="member-panel-about" aria-labelledby="member-tab-about" hidden={active !== "about"} className={styles.tabPanel}>{about}</div>
      <div role="tabpanel" id="member-panel-badges" aria-labelledby="member-tab-badges" hidden={active !== "badges"} className={styles.tabPanel}>
        <h2 className={styles.sectionTitle}>Badges</h2>
        {badges.length === 0 ? <p className={styles.empty}>No badges earned yet.</p> : <div className={styles.badgeGrid}>
          {badges.map((badge) => <div key={badge.code} className={styles.badge}><span className={styles.badgeIcon}><Medal size={16} /></span><p className={styles.badgeName}>{badge.name}</p><p className={styles.badgeDesc}>{badge.description}</p></div>)}
        </div>}
      </div>
    </section>
  );
}
