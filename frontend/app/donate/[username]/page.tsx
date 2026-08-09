"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { publicApi } from "@/lib/api";
import { formatIDR } from "@/lib/format";
import type { PublicProfile } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SiteFooter } from "@/components/site-footer";

const QUICK_AMOUNTS = [10000, 25000, 50000, 100000];
const MEDIA_OPTIONS = [
  { value: "", label: "No media" },
  { value: "youtube", label: "YouTube" },
  { value: "gif", label: "GIF" },
  { value: "image", label: "Image" },
];

declare global {
  interface Window {
    snap?: { pay: (token: string, opts?: object) => void };
  }
}

export default function DonatePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [amount, setAmount] = useState(25000);
  const [mediaType, setMediaType] = useState("");
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState("");
  const MAX_MESSAGE = 500;

  useEffect(() => {
    publicApi<PublicProfile>(`/users/${username}`)
      .then((p) => {
        setProfile(p);
        setAmount(p.minimumDonation);
      })
      .catch(() => setNotFound(true));
  }, [username]);

  const loadSnap = useCallback(() => {
    return new Promise<void>((resolve) => {
      if (window.snap) return resolve();
      const s = document.createElement("script");
      s.src = process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL || "https://app.sandbox.midtrans.com/snap/snap.js";
      s.setAttribute("data-client-key", process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || "");
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.body.appendChild(s);
    });
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    setPaying(true);
    const form = new FormData(e.currentTarget);
    try {
      const result = await publicApi<{
        orderId: string;
        snapToken: string;
        redirectUrl: string;
      }>("/donations", {
        method: "POST",
        body: JSON.stringify({
          username,
          donorName: form.get("donorName"),
          amount,
          message: form.get("message"),
          mediaType,
          mediaUrl: form.get("mediaUrl"),
        }),
      });
      // Mock mode (MOCK_MIDTRANS=true in dev): token starts with "mock-".
      // Simulate settlement via the dev endpoint, then treat as success —
      // so the balance is credited and media shows up on the widget.
      if (result.snapToken.startsWith("mock-")) {
        try {
          await publicApi(`/dev/midtrans-settle/${result.orderId}`, {
            method: "POST",
          });
        } catch {
          // ignore: still show the success message
        }
        toast.success(
          "Support received! (mock mode) The media will show up on the widget.",
        );
        return;
      }
      await loadSnap();
      if (window.snap && result.snapToken) {
        window.snap.pay(result.snapToken, {
          onSuccess: () => {
            toast.success("Payment successful! Media will appear on the widget.");
          },
          onPending: () => toast.info("Payment is being processed."),
          onError: () => toast.error("Payment failed."),
        });
      } else if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPaying(false);
    }
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-sm">
          <CardContent className="p-8 text-center">
            <p className="font-semibold">Creator not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Username &quot;{username}&quot; is not registered.
            </p>
            <Button asChild className="mt-4">
              <Link href="/">Go back</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/40">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold">
            Media<span className="text-primary">Share</span>
          </Link>
          <Badge variant="outline">/donate/{profile.username}</Badge>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl flex-1 px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold">{profile.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Thank you for your support! 💜
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Send Support</CardTitle>
            <CardDescription>
              Minimum {formatIDR(profile.minimumDonation)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <Label>Amount</Label>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {QUICK_AMOUNTS.map((a) => (
                    <Button
                      key={a}
                      type="button"
                      variant={amount === a ? "default" : "outline"}
                      onClick={() => setAmount(a)}
                    >
                      {formatIDR(a).replace("Rp", "")}
                    </Button>
                  ))}
                </div>
                <div className="mt-2">
                  <Input
                    type="number"
                    min={profile.minimumDonation}
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="text-right"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="donorName">Your name</Label>
                <Input id="donorName" name="donorName" required maxLength={100} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="message">Message</Label>
                  <span
                    className={`text-xs ${
                      message.length >= MAX_MESSAGE
                        ? "font-semibold text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {message.length}/{MAX_MESSAGE}
                  </span>
                </div>
                <Textarea
                  id="message"
                  name="message"
                  rows={3}
                  maxLength={MAX_MESSAGE}
                  placeholder="Keep streaming!"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <div>
                <Label>Media (optional)</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {MEDIA_OPTIONS.map((m) => (
                    <Button
                      key={m.value}
                      type="button"
                      size="sm"
                      variant={mediaType === m.value ? "default" : "outline"}
                      onClick={() => setMediaType(m.value)}
                    >
                      {m.label}
                    </Button>
                  ))}
                </div>
                {mediaType && (
                  <div className="mt-2">
                    <Input
                      name="mediaUrl"
                      placeholder={
                        mediaType === "youtube"
                          ? "https://youtube.com/watch?v=..."
                          : "https://giphy.com/... or an image URL https://..."
                      }
                    />
                  </div>
                )}
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={paying}>
                {paying ? "Connecting payment..." : "Send Support"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
