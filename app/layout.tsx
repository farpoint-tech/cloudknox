import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "CloudKnox | Farpoint Technologies",
  description:
    "Professionelle PowerShell-Scripts für Microsoft Intune, Azure AD und Entra ID Management. Enterprise-ready Automatisierung von Farpoint Technologies.",
  keywords: [
    "Microsoft Intune",
    "Azure AD",
    "Entra ID",
    "PowerShell",
    "Autopilot",
    "LAPS",
    "Device Management",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`${inter.variable} ${jetbrainsMono.variable} bg-background`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
