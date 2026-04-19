import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import ActiveTimerBar from "@/components/ActiveTimerBar";
import ThemeProvider from "@/components/ThemeProvider";
import AuthProvider from "@/components/AuthProvider";
import LoginGate from "@/components/LoginGate";
import KeyboardInsetProvider from "@/components/KeyboardInsetProvider";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ADDit",
  description: "Frictionless journaling & time tracking for ADHD brains",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ADDit",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0C16" }, // updated dark bg
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-screen pb-nav font-sans antialiased text-[var(--color-text)] bg-[var(--color-bg)] selection:bg-[var(--color-accent)] selection:text-white transition-colors duration-500" suppressHydrationWarning>
        <ThemeProvider>
          <KeyboardInsetProvider />
          <AuthProvider>
            <LoginGate />
            <div className="fixed inset-0 z-[-1] pointer-events-none noise-bg" />
            <div className="fixed inset-0 z-[-1] pointer-events-none gradient-mesh opacity-40 dark:opacity-20" />
            <main className="max-w-lg lg:max-w-5xl mx-auto px-5 pt-6 relative z-0">
              {children}
            </main>
            <ActiveTimerBar />
            <NavBar />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
