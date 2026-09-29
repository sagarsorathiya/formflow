/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig = {
  reactStrictMode: true,

  // ldapts does low-level BER/ASN.1 binary encoding for LDAP binds — webpack
  // bundling it (the default) corrupts that encoding in subtle ways that only
  // surface at runtime (bind requests that work standalone fail when bundled).
  // Force Next.js to load it via native require() from node_modules instead.
  experimental: {
    serverComponentsExternalPackages: ["ldapts"],
  },

  // Security headers on every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval required by Next.js dev
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-src 'self' blob:", // PDF attachment previews render via a blob: URL in an <iframe>
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Ensure no external image domains — on-prem only
  images: {
    unoptimized: false,
    remotePatterns: [],
  },

  // Webpack: don't bundle server-only modules into client chunks
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        child_process: false,
      };
    }
    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
