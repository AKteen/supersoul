import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Avoid picking a parent lockfile outside this monorepo.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
