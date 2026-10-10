import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let projectImagePattern: URL | null = null;
if (supabaseUrl) {
  try {
    projectImagePattern = new URL("/storage/v1/object/public/project-images/**", supabaseUrl);
  } catch {
    projectImagePattern = null;
  }
}

const nextConfig: NextConfig = {
  async headers() {
    const privateHeaders = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "CDN-Cache-Control", value: "no-store" },
      { key: "Vercel-CDN-Cache-Control", value: "no-store" },
    ];
    return [
      { source: "/admin", headers: privateHeaders },
      { source: "/admin/:path*", headers: privateHeaders },
      {
        source: "/authpreview",
        headers: [
          ...privateHeaders,
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: projectImagePattern ? [projectImagePattern] : [],
    maximumRedirects: 0,
  },
};

export default nextConfig;
