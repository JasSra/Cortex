import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cortex - Voice-First Notes Brain",
  description: "A voice-first notes and knowledge management system",
  manifest: "/manifest.json",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
