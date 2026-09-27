import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
