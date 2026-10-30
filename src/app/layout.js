import { Geist, Geist_Mono, Assistant } from "next/font/google";
import { cookies } from "next/headers";
import { CANONICAL_ORIGIN } from "@/lib/server/origin";
import { getCurrentUser, getUserDoc } from "@/lib/server/auth";
import { getPrisma } from "@/lib/db/prisma";
import { organizationJsonLd, websiteJsonLd, SITE_DESCRIPTION } from "@/lib/seo";
import "./globals.css";
import Nav from "@/components/Nav";
import Providers from "@/components/Providers";
import PushSetup from "@/components/PushSetup";
import GlobalTheme from "@/components/GlobalTheme";
import LoungeExpiryGuard from "@/components/LoungeExpiryGuard";
import JsonLd from "@/components/JsonLd";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const assistant = Assistant({
  variable: "--font-assistant",
  weight: ["300", "400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: {
    default: "Secret Yarnery",
    template: "%s — Secret Yarnery",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Secret Yarnery",
  category: "community",
  authors: [{ name: "Secret Yarnery" }],
  creator: "Secret Yarnery",
  publisher: "Secret Yarnery",
  manifest: "/manifest.webmanifest",
  other: {
    "google-site-verification": "EO1A_95MmyPuFD2ULeSrZ2xzliMUJEdAWtRmclDUwPo",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  openGraph: {
    siteName: "Secret Yarnery",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1734,
        height: 907,
        alt: "Secret Yarnery — Connect, Learn & Grow Together",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: CANONICAL_ORIGIN,
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
};

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value || "en";
  const messages = (await import(`../../messages/${locale}.json`)).default;

  // The app shell (topbar + sidebar + sidebar profile) lives here, once, so it
  // persists across client-side navigation instead of remounting and refetching
  // on every page change. Only rendered for signed-in members; public pages
  // keep their bare chrome. Role is read here too, so per-page Nav wrappers are
  // gone and pages just return their content.
  const user = await getCurrentUser().catch(() => null);
  const role = user ? (await getUserDoc(user.uid).catch(() => null))?.role : null;
  // Render the bell's initial count on the server so the badge is visible
  // immediately, even if the browser's /api/me or unread poll is delayed.
  let initialUnreadCount = 0;
  if (user) {
    try {
      const prisma = getPrisma();
      if (prisma) {
        initialUnreadCount = await prisma.notification.count({
          where: { userId: user.uid, read: false },
        });
      }
    } catch {
      // The client-side poll remains the fallback if the initial count fails.
    }
  }

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} ${assistant.variable}`}>
      <body>
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        <Providers messages={messages} locale={locale}>
          <LoungeExpiryGuard />
          <PushSetup />
          <GlobalTheme />
          {user ? <Nav role={role} initialUnreadCount={initialUnreadCount}>{children}</Nav> : children}
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
