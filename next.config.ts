import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // Shown next to the sync status so it's clear which release a device is running.
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  // The board at "/" replaced the separate Library page; keep old links (and query filters) working.
  async redirects() {
    return [{ source: "/library", destination: "/", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
