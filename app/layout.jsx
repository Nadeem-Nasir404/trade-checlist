import { IBM_Plex_Mono, Sora } from "next/font/google";

import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-disp",
  display: "swap"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata = {
  title: "Trade Journal Protocol",
  description: "Pre-market checklist, daily bias planner, and Notion-synced trade journal."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sora.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
