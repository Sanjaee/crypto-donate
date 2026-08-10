import { Suspense } from "react";
import QRWidgetClient from "./widget";

export default async function QRWidgetPage({
  searchParams,
}: {
  searchParams: Promise<{
    streamKey?: string;
    bgColor?: string;
    qrColor?: string;
  }>;
}) {
  const { streamKey, bgColor, qrColor } = await searchParams;
  return (
    <Suspense fallback={null}>
      <QRWidgetClient
        streamKey={streamKey ?? ""}
        bgColor={bgColor ? `#${bgColor}` : undefined}
        qrColor={qrColor ? `#${qrColor}` : undefined}
      />
    </Suspense>
  );
}
