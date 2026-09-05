"use client";

import { useEffect, useRef, useState } from "react";
import { formatUSD } from "@/lib/format";
import type { WidgetConfig, WidgetMedia } from "@/types";

function isYouTube(type: string) {
  return type === "youtube";
}

export default function WidgetClient({
  streamKey,
  demo = false,
}: {
  streamKey: string;
  demo?: boolean;
}) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [media, setMedia] = useState<WidgetMedia | null>(null);

  const playingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play sound when media arrives (payment confirmed / test media).
  useEffect(() => {
    if (media?.id && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [media]);

  // Fetch display config once.
  useEffect(() => {
    if (!streamKey) return;
    fetch(
      `/api/widgets/mediashare/config?streamKey=${encodeURIComponent(streamKey)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setConfig(j?.data ?? null))
      .catch(() => {});
  }, [streamKey]);

  // Realtime via SSE + fallback polling (15s).
  useEffect(() => {
    if (!streamKey) return;
    let stopped = false;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let initial: ReturnType<typeof setTimeout> | undefined;

    async function claim() {
      if (playingRef.current || stopped) return;
      try {
        const res = await fetch(
          `/api/widgets/mediashare/media?streamKey=${encodeURIComponent(streamKey)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!stopped && json?.data?.id) {
          setMedia(json.data);
          playingRef.current = true;
        }
      } catch {
        // ignore
      }
    }

    try {
      es = new EventSource(
        `/api/widgets/mediashare/stream?streamKey=${encodeURIComponent(streamKey)}`,
      );
      es.addEventListener("media", claim);
    } catch {
      // ignore
    }

    initial = setTimeout(claim, 1000);
    timer = setInterval(claim, 15000);

    return () => {
      stopped = true;
      if (es) es.close();
      if (timer) clearInterval(timer);
      if (initial) clearTimeout(initial);
    };
  }, [streamKey]);

  // Mark complete after duration ends.
  useEffect(() => {
    if (!media || !streamKey) return;
    const duration = Math.max(media.duration || 10, 3) * 1000;
    const t = setTimeout(async () => {
      try {
        await fetch(
          `/api/widgets/mediashare/${media.id}/complete?streamKey=${encodeURIComponent(streamKey)}`,
          { method: "POST", cache: "no-store" },
        );
      } catch {
        // ignore
      }
      playingRef.current = false;
      setMedia(null);
    }, duration);
    return () => clearTimeout(t);
  }, [media, streamKey]);

  if (!streamKey) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Missing streamKey</p>
      </div>
    );
  }

  const showBanner = (config?.showDonorName ?? true) && (media?.donorName || media?.amount || media?.message);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent">
      <audio ref={audioRef} src="/bgm.mp3" preload="auto" />
      {media ? (
        <div className="relative h-full w-full">
          {/* Full Screen Media Display */}
          <div className="absolute inset-0 h-full w-full overflow-hidden">
            {isYouTube(media.mediaType) && media.mediaUrl ? (
              <iframe
                src={`https://www.youtube.com/embed/${media.mediaUrl}?autoplay=1&controls=0&rel=0`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-none object-cover"
                title="Media donation"
              />
            ) : media.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.mediaUrl}
                alt="Media donation"
                className="h-full w-full object-cover object-center"
              />
            ) : null}
          </div>

          {/* Donation Alert Overlay Block (Image 2 style) */}
          {showBanner && (
            <div className="absolute bottom-0 left-0 right-0 z-50 w-full animate-fade-in-up">
              <div className="bg-amber-400 px-4 py-3 text-center shadow-lg">
                <p className="text-xl font-mono text-gray-900">
                  {media.donorName && (
                    <span className="text-blue-600">{media.donorName} </span>
                  )}
                  {media.donorName ? "baru saja memberikan " : ""}
                  {(config?.showAmount ?? true) && media.amount > 0 && (
                    <span className="text-blue-600">
                      {formatUSD(media.amount)}
                    </span>
                  )}
                </p>
                {(config?.showMessage ?? true) && media.message && (
                  <p className="mt-1 text-lg font-mono text-gray-900 uppercase">
                    {media.message}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="animate-pulse text-sm text-white/40">
            Waiting for support...
          </p>
        </div>
      )}
    </div>
  );
}
