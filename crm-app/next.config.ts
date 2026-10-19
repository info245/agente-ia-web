import type { NextConfig } from "next";

// The Express API (Render). The browser only talks to this app's origin, so the
// HttpOnly crm_session cookie stays first-party and no CORS is needed.
const apiUrl = (process.env.CRM_API_URL || "http://localhost:3000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  async redirects() {
    return [
      { source: "/", destination: "/inicio", permanent: false },
      { source: "/leads/:path*", destination: "/conversaciones", permanent: false },
      { source: "/agente", destination: "/asistente", permanent: false },
    ];
  },
};

export default nextConfig;
