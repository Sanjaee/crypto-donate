"use client";

import { useEffect, useRef, useState } from "react";
import { formatUSD } from "@/lib/format";
import type { WidgetConfig, WidgetMedia } from "@/types";

function getYouTubeEmbedUrl(url: string) {
  if (!url) return "";
  let videoId = url;
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      videoId = match[2];
    }
  }
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&rel=0&modestbranding=1&enablejsapi=1&iv_load_policy=3`;
}

function isYouTube(type: string) {
  return type === "youtube";
}

const DEMO_MEDIA: WidgetMedia = {
  id: "demo-1",
  donorName: "Someguy",
  amount: 69420,
  message: "THIS IS A FAKE MESSAGE! HAVE A GOOD ONE",
  mediaType: "youtube",
  mediaUrl: "dQw4w9WgXcQ",
  duration: 9999,
};

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
  const claimRef = useRef<() => void>(() => {});

  // Play sound when media arrives
  useEffect(() => {
    const activeMedia = media || (demo ? DEMO_MEDIA : null);
    if (activeMedia?.id && audioRef.current && media) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [media, demo]);

  // Fetch display config once
  useEffect(() => {
    if (!streamKey) return;
    fetch(
      `/api/widgets/mediashare/config?streamKey=${encodeURIComponent(streamKey)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setConfig(j?.data ?? null))
      .catch(() => {});
  }, [streamKey]);

  // Fast Realtime Claiming (SSE + 2s Polling for instant test donation response)
  useEffect(() => {
    if (!streamKey || demo) return;
    let stopped = false;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;

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

    claimRef.current = claim;

    // Instant claim on mount
    claim();

    try {
      es = new EventSource(
        `/api/widgets/mediashare/stream?streamKey=${encodeURIComponent(streamKey)}`,
      );
      es.addEventListener("media", () => {
        claim();
      });
      es.onopen = () => {
        claim();
      };
    } catch {
      // ignore
    }

    // Fast polling every 2s for instant response
    timer = setInterval(claim, 2000);

    return () => {
      stopped = true;
      if (es) es.close();
      if (timer) clearInterval(timer);
    };
  }, [streamKey, demo]);


  // Mark complete after duration ends & immediately claim next media in queue
  useEffect(() => {
    if (!media || !streamKey || demo) return;
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
      setTimeout(() => {
        claimRef.current();
      }, 300);
    }, duration);
    return () => clearTimeout(t);
  }, [media, streamKey, demo]);



  if (!streamKey && !demo) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <p className="text-white/60 font-mono">Missing streamKey</p>
      </div>
    );
  }

  const activeMedia = media || (demo ? DEMO_MEDIA : null);
  const showBanner =
    activeMedia &&
    ((config?.showDonorName ?? true) &&
      (activeMedia.donorName || activeMedia.amount || activeMedia.message));

  return (
    <div className="relative flex flex-col h-screen w-screen overflow-hidden bg-transparent">
      <audio ref={audioRef} src="/bgm.mp3" preload="auto" />
      {activeMedia ? (
        <div className="relative flex flex-col h-full w-full">
          {/* Full Screen Media Display */}
          <div className="relative flex-1 w-full h-full overflow-hidden bg-black flex items-center justify-center">
            {isYouTube(activeMedia.mediaType) && activeMedia.mediaUrl ? (
              <iframe
                src={getYouTubeEmbedUrl(activeMedia.mediaUrl)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0 pointer-events-none scale-[1.02]"
                title="Media donation"
              />
            ) : activeMedia.mediaType === "video" ? (
              <video
                src={activeMedia.mediaUrl}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
            ) : activeMedia.mediaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeMedia.mediaUrl}
                alt="Media donation"
                className="h-full w-full object-cover object-center"
              />
            ) : null}
          </div>

          {/* Saweria Style Bottom Donation Banner */}
          {showBanner && (
            <div className="w-full bg-[#fba919] py-3 px-4 text-center shadow-lg shrink-0 border-t border-amber-600/30 font-mono z-50">
              <p className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug">
                {activeMedia.donorName && (
                  <span className="text-[#3b82f6] font-extrabold">
                    {activeMedia.donorName}{" "}
                  </span>
                )}
                {activeMedia.donorName ? "just donated " : ""}
                {(config?.showAmount ?? true) && activeMedia.amount > 0 && (
                  <span className="text-[#3b82f6] font-extrabold">
                    {formatUSD(activeMedia.amount)}
                  </span>
                )}
              </p>
              {(config?.showMessage ?? true) && activeMedia.message && (
                <p className="mt-0.5 text-lg sm:text-xl font-bold text-gray-900 uppercase tracking-wide break-words">
                  {activeMedia.message}
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}


