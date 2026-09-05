import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "BeReply - Instagram comment-to-DM automation",
  description:
    "Send an Instagram DM automatically when someone comments a keyword on your post or reel, using the official Meta API.",
  keywords: [
    "instagram automation",
    "comment to DM",
    "instagram private replies",
    "social commerce",
  ],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BeReply",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
  // Installed on iOS the app owns the full screen, notch included; the safe
  // area insets below keep content clear of the system UI.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full dark ${fraunces.variable}`}>
      <body
        className="min-h-full bg-background text-foreground font-sans antialiased"
        // Clears the home indicator when installed; 0 everywhere else.
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
