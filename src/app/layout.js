import { Geist, Geist_Mono, Assistant } from "next/font/google";
import { cookies } from "next/headers";
import dynamic from "next/dynamic";
import "./globals.css";
import Providers from "@/components/Providers";
import GlobalTheme from "@/components/GlobalTheme";

const PushSetup = dynamic(() => import("@/components/PushSetup"), { ssr: false });
const LoungeExpiryGuard = dynamic(() => import("@/components/LoungeExpiryGuard"), { ssr: false });
const ThemePicker = dynamic(() => import("@/components/ThemePicker"), { ssr: false });

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
  metadataBase: new URL("https://yarnerylounge.vercel.app"),
  title: {
    default: "Secret Yarnery",
    template: "%s — Secret Yarnery",
  },
  description:
    "Secret Yarnery is a paid membership community with live video rooms, courses, events, groups and real conversations — connect, learn and grow together in one place.",
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
    canonical: "https://yarnerylounge.vercel.app",
  },
};

export default async function RootLayout({ children }) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value || "en";
  const messages = {
    en: (await import("../../messages/en.json")).default,
    fr: (await import("../../messages/fr.json")).default,
    de: (await import("../../messages/de.json")).default,
  };
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} ${assistant.variable}`}>
      <body>
        <Providers messages={messages} locale={locale}>
          <LoungeExpiryGuard />
          <PushSetup />
          <GlobalTheme />
          <ThemePicker />
          {children}
        </Providers>
      </body>
    </html>
  );
}
