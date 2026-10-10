import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicProfileView } from "@/components/account/PublicProfileView";

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const image = `/og/u/${encodeURIComponent(handle)}`;
  return { title: "Fan profile", openGraph: { images: [image] }, twitter: { card: "summary_large_image", images: [image] } };
}

export default function PublicProfilePage() {
  return (
    <Suspense>
      <PublicProfileView />
    </Suspense>
  );
}
