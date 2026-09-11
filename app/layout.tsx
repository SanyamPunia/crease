import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

// Vercel sets this on a deployment, with no protocol. Absolute metadata URLs need it,
// and without a base Next resolves them against localhost.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:4123";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Crease, layout testing for the iPhone Duo",
  description:
    "Load any site at every width between the iPhone Duo cover display and the unfolded inner display, and read what breaks from inside the page.",
};

export const viewport: Viewport = {
  themeColor: "#f3f3f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
