import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "../contexts/ThemeContext";
import { AuthProvider } from "../contexts/AuthContext";
import { MascotProvider } from "../contexts/MascotContext";
import { AuthWrapper } from "../components/AuthWrapper";
import { StructuredData } from "../components/StructuredData";

const isDevelopment = process.env.NEXT_PUBLIC_DEV_MODE === 'true'

export const metadata: Metadata = {
  title: {
    default: "Cortex - Personal Knowledge Hub",
    template: "%s | Cortex"
  },
  description: "A secure, AI-powered personal knowledge management system with voice capabilities, document upload, intelligent search, and Azure AD B2C authentication. Organize and discover your knowledge with advanced AI.",
  keywords: [
    "knowledge management",
    "AI search",
    "document organization",
    "voice notes",
    "personal assistant",
    "Azure AD B2C",
    "secure notes",
    "intelligent search",
    "document upload",
    "productivity"
  ],
  authors: [{ name: "Cortex Team" }],
  creator: "Cortex",
  publisher: "Cortex",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cortex",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://cortex.yourdomain.com",
    siteName: "Cortex - Personal Knowledge Hub",
    title: "Cortex - Your AI-Powered Knowledge Management System",
    description: "Securely organize, search, and discover your documents with AI-powered insights and voice capabilities.",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "Cortex - Personal Knowledge Hub",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cortex - Personal Knowledge Hub",
    description: "AI-powered knowledge management with secure authentication and voice capabilities.",
    images: ["/og-image.svg"],
  },
  robots: {
    index: false, // Set to true when ready for production
    follow: false, // Set to true when ready for production
    googleBot: {
      index: false,
      follow: false,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  category: "productivity",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#8b5cf6" },
    { media: "(prefers-color-scheme: dark)", color: "#8b5cf6" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <StructuredData />
      </head>
      <body className="antialiased bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
        <ThemeProvider>
          <AuthProvider>
            <MascotProvider position="bottom-right" size="medium">
              <AuthWrapper>
                {children}
              </AuthWrapper>
            </MascotProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
