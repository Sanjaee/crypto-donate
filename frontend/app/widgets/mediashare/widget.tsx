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
  const [demoVisible, setDemoVisible] = useState(demo);
  const playingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Demo hanya tampil 10 detik.
  useEffect(() => {
    if (!demo) return;
    const t = setTimeout(() => setDemoVisible(false), 10000);
    return () => clearTimeout(t);
  }, [demo]);

  // Play a sound when media arrives (payment confirmed).
  useEffect(() => {
    if (media?.id && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [media]);

  // Fetch display config once.
  useEffect(() => {
    if (demo || !streamKey) return;
    fetch(
      `/api/widgets/mediashare/config?streamKey=${encodeURIComponent(streamKey)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setConfig(j?.data ?? null))
      .catch(() => {});
  }, [streamKey]);

  // Realtime via SSE + fallback polling lambat (15s) sebagai jaring pengaman.
  useEffect(() => {
    if (demo || !streamKey) return;
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
        // abaikan
      }
    }

    // SSE: event "media" -> claim sekali (SKIP LOCKED, cegah double-play).
    try {
      es = new EventSource(
        `/api/widgets/mediashare/stream?streamKey=${encodeURIComponent(streamKey)}`,
      );
      es.addEventListener("media", claim);
    } catch {
      // SSE gagal — andalkan fallback polling.
    }

    // Fallback polling lambat.
    initial = setTimeout(claim, 2000);
    timer = setInterval(claim, 15000);

    return () => {
      stopped = true;
      if (es) es.close();
      if (timer) clearInterval(timer);
      if (initial) clearTimeout(initial);
    };
  }, [streamKey]);

  // Mark complete after the duration ends.
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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent">
      <audio ref={audioRef} src="/bgm.mp3" preload="auto" />
      {demoVisible ? (
        // Mode demo: video tm.mp4 full-screen + contoh donor (10 detik)
        <div className="absolute inset-0">
          <video
            src="/tm.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-6">
            <div className="w-full max-w-3xl rounded-lg bg-primary px-8 py-4 text-center shadow-2xl">
              <p className="text-xl font-bold text-primary-foreground">
                Mumu just gave{" "}
                <span className="font-extrabold">$10.00</span>
              </p>
              <p className="mt-0.5 text-base text-primary-foreground/90">
                Keep up the great work! 🔥
              </p>
            </div>
          </div>
        </div>
      ) : media ? (
        <div className="absolute inset-0 flex animate-fade-in-up items-center justify-center">
          <div className="w-full max-w-3xl px-4">
            {isYouTube(media.mediaType) && media.mediaUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-xl shadow-2xl">
                <iframe
                  src={`https://www.youtube.com/embed/${media.mediaUrl}?autoplay=1&controls=0&rel=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                  title="Media donation"
                />
              </div>
            ) : media.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.mediaUrl}
                alt="Media donation"
                className="mx-auto max-h-[60vh] rounded-xl object-contain shadow-2xl"
              />
            ) : null}

            {(config?.showDonorName ?? true) && media.donorName && (
              <div className="mt-6 w-full rounded-lg bg-primary px-8 py-4 text-center shadow-2xl">
                <p className="text-xl font-bold text-primary-foreground">
                  {config?.showDonorName && media.donorName
                    ? `${media.donorName} just gave `
                    : ""}
                  {config?.showAmount && (
                    <span className="font-extrabold">
                      {formatUSD(media.amount)}
                    </span>
                  )}
                </p>
                {config?.showMessage && media.message && (
                  <p className="mt-0.5 text-base text-primary-foreground/90">
                    {media.message}
                  </p>
                )}
              </div>
            )}
          </div>
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
