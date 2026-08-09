"use client";

import { useEffect, useRef, useState } from "react";
import { formatIDR } from "@/lib/format";
import type { WidgetConfig, WidgetMedia } from "@/types";

const POLL_INTERVAL_MS = 2000;

function isYouTube(type: string) {
  return type === "youtube";
}

export default function WidgetClient({ streamKey }: { streamKey: string }) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [media, setMedia] = useState<WidgetMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playingRef = useRef(false);

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

  // Poll the queue.
  useEffect(() => {
    if (!streamKey) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function poll() {
      if (playingRef.current) return;
      try {
        const res = await fetch(
          `/api/widgets/mediashare/media?streamKey=${encodeURIComponent(streamKey)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("widget failed");
        const json = await res.json();
        // Make sure there is really media (has an id), not a wrong/empty
        // shape ({"data":null} or {"data":{"data":null}}).
        if (!stopped && json?.data?.id) {
          setMedia(json.data);
          playingRef.current = true;
        }
      } catch {
        setError("Unable to connect to the widget");
      }
    }

    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
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
      {media && (
        <div className="absolute inset-0 flex animate-fade-in-up items-center justify-center">
          <div className="w-full max-w-3xl px-4">
            {isYouTube(media.mediaType) ? (
              <div className="aspect-video w-full overflow-hidden rounded-xl shadow-2xl">
                <iframe
                  src={`https://www.youtube.com/embed/${media.mediaUrl}?autoplay=1&controls=0&rel=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full"
                  title="Media donation"
                />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.mediaUrl}
                alt="Media donation"
                className="mx-auto max-h-[60vh] rounded-xl object-contain shadow-2xl"
              />
            )}

            {(config?.showDonorName ?? true) && media.donorName && (
              <div className="mt-6 rounded-2xl border bg-black/70 p-6 text-white shadow-2xl backdrop-blur">
                {config?.showDonorName && (
                  <p className="text-xl font-bold">{media.donorName}</p>
                )}
                {config?.showAmount && (
                  <p className="mt-1 text-2xl font-extrabold text-emerald-400">
                    {formatIDR(media.amount)}
                  </p>
                )}
                {config?.showMessage && media.message && (
                  <p className="mt-2 text-lg">{media.message}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!media && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="animate-pulse text-sm text-white/40">
            Waiting for support...
          </p>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-red-600/80 px-4 py-2 text-sm text-white">
          {error}
        </div>
      )}
    </div>
  );
}
