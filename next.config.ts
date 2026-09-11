import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only. Next 16 refuses to serve its own chunks to an origin it does not recognise,
  // so opening the bench on 127.0.0.1 rather than localhost blocks hydration with no error
  // in the browser. The verification script and anything driving a real browser hit the
  // loopback address directly.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
