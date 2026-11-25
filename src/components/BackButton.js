"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useNavigationSlide } from "@/lib/navigation-slide";
import styles from "./BackButton.module.css";

const MEMBER_ROUTES = {
  "/feed": ["/dashboard", "Dashboard"],
  "/events": ["/dashboard", "Dashboard"],
  "/events/suggest": ["/events", "Events"],
  "/members": ["/dashboard", "Dashboard"],
  "/groups": ["/dashboard", "Dashboard"],
  "/groups/create": ["/groups", "Groups"],
  "/courses": ["/dashboard", "Dashboard"],
  "/calendar": ["/dashboard", "Dashboard"],
  "/community": ["/dashboard", "Dashboard"],
  "/community/studio": ["/dashboard", "Dashboard"],
  "/studio": ["/dashboard", "Dashboard"],
  "/neighbourhoods": ["/dashboard", "Dashboard"],
  "/match": ["/dashboard", "Dashboard"],
  "/gallery": ["/dashboard", "Dashboard"],
  "/recordings": ["/dashboard", "Dashboard"],
  "/portfolio": ["/dashboard", "Dashboard"],
  "/leaderboard": ["/dashboard", "Dashboard"],
  "/spaces": ["/dashboard", "Dashboard"],
  "/collections": ["/dashboard", "Dashboard"],
  "/quizzes": ["/dashboard", "Dashboard"],
  "/quizzes/questions": ["/quizzes", "Quizzes"],
  "/resources": ["/dashboard", "Dashboard"],
  "/search": ["/dashboard", "Dashboard"],
  "/explore": ["/dashboard", "Dashboard"],
  "/discovery": ["/dashboard", "Dashboard"],
  "/membership": ["/dashboard", "Dashboard"],
  "/account": ["/dashboard", "Dashboard"],
  "/account/profile": ["/account", "Account"],
  "/account/settings": ["/account", "Account"],
  "/account/membership": ["/account", "Account"],
  "/account/hobbies": ["/account", "Account"],
  "/settings/social": ["/account/settings", "Settings"],
  "/articles": ["/dashboard", "Dashboard"],
  "/articles/new": ["/articles", "Articles"],
  "/perks/shop": ["/dashboard", "Dashboard"],
  "/perks/patterns": ["/dashboard", "Dashboard"],
  "/perks/sessions": ["/dashboard", "Dashboard"],
  "/dashboard/community": ["/dashboard", "Dashboard"],
  "/dashboard/content": ["/dashboard", "Dashboard"],
  "/dashboard/membership": ["/dashboard", "Dashboard"],
  "/host": ["/dashboard", "Dashboard"],
  "/host/courses": ["/host", "Host tools"],
  "/host/events": ["/host", "Host tools"],
  "/host/rooms": ["/host", "Host tools"],
  "/topics": ["/dashboard", "Dashboard"],
  "/rooms": ["/dashboard", "Dashboard"],
};

function getDestination(pathname, admin) {
  if (admin) {
    if (pathname === "/admin" || pathname === "/admin/") return null;
    if (/^\/admin\/courses\/[^/]+$/.test(pathname)) return { href: "/admin/courses", label: "Courses" };
    if (/^\/admin\/events\/submissions$/.test(pathname)) return { href: "/admin/events", label: "Events" };
    return { href: "/admin", label: "Admin dashboard" };
  }

  if (!pathname || pathname === "/dashboard" || pathname === "/") return null;
  const exact = MEMBER_ROUTES[pathname];
  if (exact) return { href: exact[0], label: exact[1] };

  const space = pathname.match(/^\/spaces\/([^/]+)$/);
  if (space) return { href: "/spaces", label: "Spaces" };

  const lesson = pathname.match(/^\/courses\/([^/]+)\/lessons\/[^/]+$/);
  if (lesson) return { href: `/courses/${lesson[1]}`, label: "Course" };

  const courseQuiz = pathname.match(/^\/courses\/([^/]+)\/quiz$/);
  if (courseQuiz) return { href: `/courses/${courseQuiz[1]}`, label: "Course" };

  const spacePage = pathname.match(/^\/spaces\/([^/]+)\/pages(?:\/[^/]+)?$/);
  if (spacePage) return { href: `/spaces/${spacePage[1]}`, label: "Space" };

  const collection = pathname.match(/^\/collections\/([^/]+)$/);
  if (collection) return { href: "/collections", label: "Collections" };

  const article = pathname.match(/^\/articles\/([^/]+)$/);
  if (article && article[1] !== "new") return { href: "/articles", label: "Articles" };

  // Detail pages with an existing page-specific BackButton keep their own control.
  if (
    /^\/events\/[^/]+$/.test(pathname) ||
    /^\/members\/[^/]+$/.test(pathname) ||
    /^\/groups\/[^/]+$/.test(pathname) ||
    /^\/courses\/[^/]+$/.test(pathname)
  ) return null;

  // Chat and live video rooms have their own focused navigation controls.
  if (pathname === "/chat" || pathname.startsWith("/chat/") || pathname.startsWith("/rooms/")) return null;

  return null;
}

export default function BackButton({
  fallback = "/dashboard",
  label = "Back",
  global = false,
  admin = false,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const slide = useNavigationSlide();
  const destination = global ? getDestination(pathname, admin) : null;

  if (global && !destination) return null;

  const target = global ? destination.href : fallback;
  const buttonLabel = global ? `Back to ${destination.label}` : label;

  function handleBack() {
    if (slide?.slideBack) {
      slide.slideBack();
      return;
    }

    // Use the page's explicit parent destination so direct visits and internal
    // navigation behave identically and the visible label always stays truthful.
    router.replace(target);
  }

  return (
    <button
      type="button"
      className={styles.back}
      onClick={handleBack}
      aria-label={buttonLabel}
      title={buttonLabel}
    >
      <ArrowLeft className={styles.arrow} size={20} strokeWidth={2.2} aria-hidden="true" />
      <span>{buttonLabel}</span>
    </button>
  );
}
