import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Native and driver packages must not be bundled — they load their own
  // platform binaries and connection internals at runtime.
  serverExternalPackages: ['mysql2', '@node-rs/argon2'],
  experimental: {
    // TypeScript 7 ships the native compiler and no longer exposes the JS
    // compiler API Next.js reaches for by default; the CLI path is the one that
    // works with it. Drop this line if the project pins TypeScript 6.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
