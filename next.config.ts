import type { NextConfig } from "next";
import os from "node:os";

type NetworkInterfaceInfoLike = {
  address: string;
  internal: boolean;
};

function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>(["localhost", "127.0.0.1"]);
  const interfaces = os.networkInterfaces() as Record<
    string,
    NetworkInterfaceInfoLike[] | undefined
  >;

  for (const entries of Object.values(interfaces)) {
    for (const info of entries ?? []) {
      if (info.internal) {
        continue;
      }

      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(info.address)) {
        continue;
      }

      origins.add(info.address);
    }
  }

  return Array.from(origins);
}

const nextConfig: NextConfig = {
  allowedDevOrigins: getAllowedDevOrigins(),
};

export default nextConfig;
