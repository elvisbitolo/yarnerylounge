import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Post photos are uploaded to Vercel Blob. next/image refuses to optimise a
  // remote src unless its host is allowed here, and a rejected optimisation
  // renders as a broken image (the browser then paints the alt text) - that is
  // what put a paragraph of caption text in the gallery. Allow the whole blob
  // domain so a different store works without another deploy.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "vercel.live",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: 'camera=(self "https://8x8.vc"), microphone=(self "https://8x8.vc"), fullscreen=(self "https://8x8.vc"), display-capture=(self "https://8x8.vc"), autoplay=(self "https://8x8.vc"), geolocation=(self)' },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-inline' https://8x8.vc https://*.8x8.vc https://vercel.live; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.bigdatacloud.net https://api-bdc.io https://*.christasspeakeasy.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.googleapis.com; frame-src 'self'",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
