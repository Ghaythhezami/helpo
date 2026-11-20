import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN || "http://localhost:3001";

const nextConfig: NextConfig = {
  transpilePackages: ["@helpo/shared"],
  async redirects() {
    // The platform is two screens: Create (/app) and the lesson workspace (/app/lessons/:id).
    return [
      { source: "/app/classes", destination: "/app", permanent: false },
      { source: "/app/classes/:id", destination: "/app", permanent: false },
      { source: "/app/lessons/new", destination: "/app", permanent: false },
      { source: "/app/lessons/:id/:step(making|check|teach|results)", destination: "/app/lessons/:id", permanent: false },
      { source: "/app/class-world", destination: "/app", permanent: false },
      { source: "/app/results", destination: "/app", permanent: false },
      { source: "/app/check", destination: "/app", permanent: false },
      { source: "/play", destination: "/join", permanent: false },
      { source: "/play/avatar", destination: "/join", permanent: false },
      { source: "/play/games", destination: "/join", permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
