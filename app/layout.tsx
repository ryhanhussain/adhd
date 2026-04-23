import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import ActiveTimerBar from "@/components/ActiveTimerBar";
import ThemeProvider from "@/components/ThemeProvider";
import AuthProvider from "@/components/AuthProvider";
import LoginGate from "@/components/LoginGate";
import KeyboardInsetProvider from "@/components/KeyboardInsetProvider";
import ErrorBoundary from "@/components/ErrorBoundary";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://addit.pages.dev";

const tagline = "Your second brain for the day in front of you.";
const description =
  "A frictionless second brain for brain dumps, interstitial journaling, and quiet time tracking. Capture thoughts by voice or text, plan your day, and reflect — all in one calm app.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `ADDit — ${tagline}`,
    template: "%s · ADDit",
  },
  description,
  applicationName: "ADDit",
  keywords: [
    "second brain",
    "brain dump",
    "interstitial journaling",
    "task tracker",
    "time tracking",
    "voice journal",
    "daily intentions",
    "reflection",
    "PWA",
  ],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ADDit",
  },
  openGraph: {
    type: "website",
    siteName: "ADDit",
    title: `ADDit — ${tagline}`,
    description,
    url: siteUrl,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `ADDit — ${tagline}`,
    description,
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
      <body className="min-h-screen pb-nav font-sans antialiased text-[var(--color-text)] bg-[var(--color-bg)] selection:bg-[var(--color-accent)] selection:text-white transition-colors duration-500" suppressHydrationWarning>
        <ThemeProvider>
          <KeyboardInsetProvider />
          <AuthProvider>
            <LoginGate />
            <div className="fixed inset-0 z-[-1] pointer-events-none noise-bg" />
            <div className="fixed inset-0 z-[-1] pointer-events-none gradient-mesh opacity-40 dark:opacity-20" />
            <main className="max-w-lg lg:max-w-5xl mx-auto px-5 pt-6 relative z-0">
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
            <ActiveTimerBar />
            <NavBar />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
