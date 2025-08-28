import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AuthProvider } from "../contexts/AuthContext";
import { AuthWrapper } from "../components/AuthWrapper";

export const metadata: Metadata = {
  title: "Cortex - Personal Knowledge Hub",
  description: "A secure, AI-powered personal knowledge management system with voice capabilities",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
        <ThemeProvider>
          <AuthProvider>
            <AuthWrapper>
              {children}
            </AuthWrapper>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
