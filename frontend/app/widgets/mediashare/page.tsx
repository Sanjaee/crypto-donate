import { Suspense } from "react";
import WidgetClient from "./widget";

export default async function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ streamKey?: string }>;
}) {
  const { streamKey } = await searchParams;
  return (
    <Suspense fallback={null}>
      <WidgetClient streamKey={streamKey ?? ""} />
    </Suspense>
  );
}
