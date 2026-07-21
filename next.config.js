/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ship the SQLite snapshot inside every serverless function bundle.
    outputFileTracingIncludes: {
      "/**/*": ["./data/atlas.db"],
      "/": ["./data/atlas.db"],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
      },
    ],
  },
};

module.exports = nextConfig;
