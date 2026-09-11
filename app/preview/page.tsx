import { redirect } from "next/navigation";
import { Workspace } from "@/components/device/workspace";
import { displayUrl, normalizeInput } from "@/lib/url";

interface PreviewPageProps {
  searchParams: Promise<{ url?: string }>;
}

export async function generateMetadata({ searchParams }: PreviewPageProps) {
  const { url } = await searchParams;
  const result = url ? normalizeInput(url) : { error: "" };
  if ("error" in result) return { title: "Crease" };
  return { title: `${displayUrl(result.url)} on the iPhone Duo` };
}

/** A direct link to one site. The bench itself lives at the root. */
export default async function PreviewPage({ searchParams }: PreviewPageProps) {
  const { url } = await searchParams;
  if (!url) redirect("/");
  const result = normalizeInput(url);
  if ("error" in result) redirect("/");
  return <Workspace initialUrl={result.url} />;
}
