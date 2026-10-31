"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, FolderOpen, UserRound, Trophy, Medal } from "lucide-react";
import styles from "./profile-tabs.module.css";
import profileStyles from "./profile.module.css";
import PostEngagement from "./PostEngagement";

const TAB_ITEMS = [
  { id: "posts", label: "Posts", Icon: MessageCircle },
  { id: "projects", label: "Projects", Icon: FolderOpen },
  { id: "about", label: "About", Icon: UserRound },
  { id: "badges", label: "Badges", Icon: Trophy },
];

export default function MemberProfileTabs({ posts = [], projects = [], about, badges = [], isSelf = false, viewerId = "", member = {} }) {
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
        <h2 className={profileStyles.sectionTitle}>Recent posts</h2>
        {posts.length === 0 ? <p className={profileStyles.empty}>No posts yet.</p> : <div className={profileStyles.postList}>
          {posts.map((post) => <article key={post.id} id={`post-${post.id}`} className={profileStyles.post}>
            <div className={profileStyles.postAuthor}>{member.photoURL ? <img src={member.photoURL} alt="" /> : <span>{(member.name || "M").slice(0, 1)}</span>}<div><strong>{member.name || "Member"}</strong><small>{post.createdAt ? new Date(post.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : ""}</small></div></div><p className={profileStyles.postText}>{post.text}</p>
            {post.imageUrl && <img src={post.imageUrl} alt="" className={profileStyles.postImage} />}
            <PostEngagement post={post} viewerId={viewerId} />
          </article>)}
        </div>}
      </div>
      <div role="tabpanel" id="member-panel-projects" aria-labelledby="member-tab-projects" hidden={active !== "projects"} className={styles.tabPanel}>
        <div className={profileStyles.projectsHeader}><h2 className={profileStyles.sectionTitle}>Project portfolio</h2>{isSelf && <Link className={profileStyles.projectManageLink} href="/portfolio">Manage projects</Link>}</div>
        {projects.length === 0 ? <p className={profileStyles.empty}>{isSelf ? "Add projects to show the community what you are making." : "No projects added yet."}</p> : <div className={profileStyles.projectGrid}>
          {projects.map((project) => <article key={project.id} className={profileStyles.projectCard}>
            {project.imageUrls?.[0] && <img src={project.imageUrls[0]} alt="" className={profileStyles.projectImage} />}
            <div className={profileStyles.projectBody}><div className={profileStyles.projectTitleRow}><h3>{project.title}</h3>{project.featured && <span className={profileStyles.projectFeatured}>Featured</span>}</div>
              <p className={profileStyles.projectMeta}>{[project.craft, project.projectType, project.status].filter(Boolean).join(" · ")}</p>
              {project.description && <p className={profileStyles.projectDescription}>{project.description}</p>}
            </div>
          </article>)}
        </div>}
      </div>
      <div role="tabpanel" id="member-panel-about" aria-labelledby="member-tab-about" hidden={active !== "about"} className={styles.tabPanel}>{about}</div>
      <div role="tabpanel" id="member-panel-badges" aria-labelledby="member-tab-badges" hidden={active !== "badges"} className={styles.tabPanel}>
        <h2 className={profileStyles.sectionTitle}>Badges</h2>
        {badges.length === 0 ? <p className={profileStyles.empty}>No badges earned yet.</p> : <div className={profileStyles.badgeGrid}>
          {badges.map((badge) => <div key={badge.code} className={profileStyles.badge}><span className={profileStyles.badgeIcon}><Medal size={16} /></span><p className={profileStyles.badgeName}>{badge.name}</p><p className={profileStyles.badgeDesc}>{badge.description}</p></div>)}
        </div>}
      </div>
    </section>
  );
}
