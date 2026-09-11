import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set(["metadata.google.internal", "metadata.goog"]);

function isPrivateAddress(address: string, family: number): boolean {
  if (family === 6) {
    const v6 = address.toLowerCase();
    if (v6 === "::1" || v6 === "::") return true;
    if (v6.startsWith("fc") || v6.startsWith("fd")) return true;
    if (v6.startsWith("fe80")) return true;
    // IPv4-mapped, ::ffff:10.0.0.1
    const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1], 4);
    return false;
  }
  const [a, b] = address.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Refuse anything that resolves inside the network the server sits in.
 * The proxy fetches whatever it is handed, so this is the only thing standing between
 * a public text field and the cloud metadata endpoint.
 */
export async function assertPublicTarget(url: URL, selfOrigin?: string): Promise<void> {
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("That host is not reachable.");
  // The bench opens on a page it serves itself, so its own origin is allowed through the
  // private-address guard. Nothing else on the loopback is.
  if (selfOrigin && url.origin === selfOrigin) return;
  if (process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1")) {
    return;
  }
  let records: LookupAddress[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    // A resolver failure is almost always a typo, so say that rather than leaking
    // getaddrinfo text into the device screen.
    throw new Error(`${host} does not resolve. Check the spelling.`);
  }
  for (const record of records) {
    if (isPrivateAddress(record.address, record.family)) {
      throw new Error("That address is on a private network.");
    }
  }
}
