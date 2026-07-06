import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "M365 Tenant Assessment",
  description:
    "Read-only Microsoft 365 / Entra ID security assessment. Runs entirely in your browser.",
  manifest: "/manifest.webmanifest",
  applicationName: "M365 Assessment",
  appleWebApp: { capable: true, title: "M365 Assessment", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
