import type { NextConfig } from "next";
import path from "node:path";

/**
 * wagmi ships every connector from one entry point; the ones we do not use
 * (Base, Coinbase, Safe, Tempo) have optional peer packages that are not installed.
 * Aliasing them to `false` keeps the bundle free of "module not found" warnings.
 */
const UNUSED_OPTIONAL_CONNECTOR_DEPS = [
  "@base-org/account",
  "@coinbase/wallet-sdk",
  "@safe-global/safe-apps-sdk",
  "@safe-global/safe-apps-provider",
  "accounts",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config) => {
    for (const dep of UNUSED_OPTIONAL_CONNECTOR_DEPS) {
      config.resolve.alias[dep] = false;
    }
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
