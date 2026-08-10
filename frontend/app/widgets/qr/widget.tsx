"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { publicApi } from "@/lib/api";

export default function QRWidgetClient({
  streamKey,
  bgColor,
  qrColor,
}: {
  streamKey: string;
  bgColor?: string;
  qrColor?: string;
}) {
  const [donateUrl, setDonateUrl] = useState<string>("");
  const [savedBg, setSavedBg] = useState("#F7931A");
  const [savedFg, setSavedFg] = useState("#000000");

  useEffect(() => {
    if (!streamKey) return;
    publicApi<{ donateUrl: string; bgColor: string; qrColor: string }>(
      `/widgets/qr/data?streamKey=${encodeURIComponent(streamKey)}`,
    )
      .then((d) => {
        setDonateUrl(d.donateUrl);
        if (d.bgColor) setSavedBg(d.bgColor);
        if (d.qrColor) setSavedFg(d.qrColor);
      })
      .catch(() => {});
  }, [streamKey]);

  const bg = bgColor ?? savedBg;
  const fg = qrColor ?? savedFg;

  if (!streamKey || !donateUrl) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-transparent">
        <div className="h-[60vmin] w-[60vmin] max-h-[480px] max-w-[480px] animate-pulse rounded-2xl bg-primary/20" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent p-0">
      <QRCodeSVG
        value={donateUrl}
        size={800}
        level="H"
        bgColor={bg}
        fgColor={fg}
        className="h-[65vmin] w-[65vmin] max-h-[600px] max-w-[600px] rounded-2xl shadow-2xl"
      />
    </div>
  );
}