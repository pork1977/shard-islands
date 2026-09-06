import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * The canonical home.
 *
 * Four hostnames serve this identical page — two spellings, each with and
 * without www — which is convenient for humans and a problem for search
 * engines, who see four copies of one thing and have to pick. Declaring the
 * real one is the cheap half of the fix; redirecting the others at the edge
 * is the thorough half.
 */
const SITE = "https://www.shardisland.me";

const TITLE = "Shard Islands — a multiplayer flight game in your browser";

const DESCRIPTION =
  "A frosted glass floor with one glowing handprint. Press it, watch it shatter, " +
  "and fall into a shared sky where your light trail is your score. " +
  "Free, no sign-up, nothing to install.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: TITLE, template: "%s · Shard Islands" },
  description: DESCRIPTION,
  applicationName: "Shard Islands",
  keywords: [
    "browser game",
    "multiplayer browser game",
    "webgl game",
    "flight game",
    "io game",
    "no download game",
    "three.js",
  ],
  alternates: { canonical: SITE },
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Shard Islands",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // The page is one full-screen canvas, so there is no chrome to tint —
  // except on a phone, where the status bar would otherwise sit white above
  // a dark sky.
  themeColor: "#05030a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
