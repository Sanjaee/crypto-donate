import { Suspense } from "react";
import WidgetClient from "./widget";

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ streamKey?: string; demo?: string }>;
}) {
  const { streamKey, demo } = await searchParams;
  return (
    <Suspense fallback={null}>
      <WidgetClient
        streamKey={streamKey ?? ""}
        demo={demo === "1" || demo === "true"}
      />
    </Suspense>
  );
}
