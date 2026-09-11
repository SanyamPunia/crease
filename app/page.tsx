import { headers } from "next/headers";
import { Workspace } from "@/components/device/workspace";
import { demoUrl } from "@/lib/site";

export default async function Home() {
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:4123";
  const proto =
    head.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return <Workspace initialUrl={demoUrl(`${proto}://${host}`)} firstRun />;
}
