/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    /*
     * The commit this bundle was built from, baked in at build time.
     *
     * The page compares it against /api/version, which answers from whatever
     * is deployed now. When they differ the browser is serving something
     * cached — which cost three rounds of re-testing features that were
     * already live, because neither side could tell.
     */
    NEXT_PUBLIC_BUILD_COMMIT: (process.env.RENDER_GIT_COMMIT ?? "dev").slice(0, 7),
  },
  // Emits a self-contained server with only the files it actually needs, which
  // is what the runtime image copies. Nothing else in the repo ships.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
