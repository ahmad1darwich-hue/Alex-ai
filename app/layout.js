import "./globals.css";

export const metadata = {
  title: "Alex",
  description: "Private Alex assistant",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
