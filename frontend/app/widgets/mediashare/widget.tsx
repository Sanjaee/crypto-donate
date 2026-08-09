"use client";

import { useEffect, useRef, useState } from "react";
import { formatUSD } from "@/lib/format";
import type { WidgetConfig, WidgetMedia } from "@/types";

const POLL_INTERVAL_MS = 2000;

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

  // Bunyi saat ada media masuk (pembayaran terkonfirmasi).
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

  // Poll the queue.
  useEffect(() => {
    if (demo || !streamKey) return;
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
        // abaikan — widget tetap mencoba pada polling berikutnya.
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
      <audio ref={audioRef} src="/bgm.mp3" preload="auto" />
      {demo ? (
        // Mode demo: contoh media dari tm.mp4
        <div className="absolute inset-0 flex animate-fade-in-up items-center justify-center">
          <div className="w-full max-w-3xl px-4">
            <video
              src="/tm.mp4"
              autoPlay
              muted
              loop
              playsInline
              className="aspect-video w-full rounded-xl object-cover shadow-2xl"
            />
            <div className="mt-6 rounded-2xl border bg-black/70 p-6 text-white shadow-2xl backdrop-blur">
              <p className="text-xl font-bold">Sample Media</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-400">
                Demo video
              </p>
              <p className="mt-2 text-lg">
                Widget media share — contoh tampilan media.
              </p>
            </div>
          </div>
        </div>
      ) : media ? (
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
                    {formatUSD(media.amount)}
                  </p>
                )}
                {config?.showMessage && media.message && (
                  <p className="mt-2 text-lg">{media.message}</p>
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
