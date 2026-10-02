/** @type {import('next').NextConfig} */
const isTauri = process.env.TAURI_BUILD === "1";

const nextConfig = {
  // The Tauri desktop build bundles a fully static export (no Node server).
  // The web/PWA build is already fully client-rendered, so this is a no-op
  // difference for Vercel other than the output location.
  ...(isTauri ? { output: "export" } : {}),
  images: { unoptimized: isTauri },
};

export default nextConfig;
