import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
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

const tagline = "Tasks and a simple completion calendar.";
const description =
  "ADDit turns brain dumps into tasks and shows completed work on a clean calendar.";

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
  icons: { icon: "/icon.svg" },
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
  interactiveWidget: "resizes-visual",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fde7e1" },
    { media: "(prefers-color-scheme: dark)", color: "#171026" },
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
            <div className="fixed inset-0 z-0 pointer-events-none gradient-mesh opacity-100 dark:opacity-90" />
            <div className="fixed inset-0 z-0 pointer-events-none noise-bg" />
            <main className="mx-auto w-full max-w-6xl px-3 pt-3 sm:px-5 lg:px-6 relative z-10">
              <TopNav />
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
