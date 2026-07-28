import "./globals.css";

export const metadata = {
  title: "Trade Journal Protocol",
  description: "Pre-market checklist, daily bias planner, and Notion-synced trade journal."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
