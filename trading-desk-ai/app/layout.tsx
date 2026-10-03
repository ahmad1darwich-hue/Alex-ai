import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pending Trading Desk",
  description:
    "Assisted crypto trading desk. Live market reads and a pending signal that waits for your approval.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
