"use client";

import { useState } from "react";
import { MessageCircle, FolderOpen, UserRound, Trophy } from "lucide-react";
import styles from "./profile-tabs.module.css";

const TAB_ITEMS = [
  { id: "posts", label: "Posts", Icon: MessageCircle },
  { id: "projects", label: "Projects", Icon: FolderOpen },
  { id: "about", label: "About", Icon: UserRound },
  { id: "badges", label: "Badges", Icon: Trophy },
];

export default function MemberProfileTabs({ posts, projects, about, badges }) {
  const [active, setActive] = useState("posts");
  const panels = { posts, projects, about, badges };
  return (
    <section className={styles.tabsShell} aria-label="Member profile sections">
      <div className={styles.tabList} role="tablist" aria-label="Profile sections">
        {TAB_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`member-tab-${id}`}
            aria-selected={active === id}
            aria-controls={`member-panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            className={active === id ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => setActive(id)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {TAB_ITEMS.map(({ id }) => (
        <div
          key={id}
          role="tabpanel"
          id={`member-panel-${id}`}
          aria-labelledby={`member-tab-${id}`}
          hidden={active !== id}
          className={styles.tabPanel}
        >
          {panels[id]}
        </div>
      ))}
    </section>
  );
}
