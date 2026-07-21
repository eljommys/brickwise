import type { NextConfig } from "next";

// Pin the workspace root to the current directory. Without it, running via `npx`
// (which nests the package under ~/.npm/_npx/<hash>/ with its own lockfile) makes
// Next pick the wrong root and Turbopack fails to build /page. The launcher and the
// npm scripts always run from the app directory, so process.cwd() is the app root.
const root = process.cwd();

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
