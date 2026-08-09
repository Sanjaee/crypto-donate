"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { publicApi } from "@/lib/api";
import { formatUSD } from "@/lib/format";
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
import { Loader2, ChevronDown } from "lucide-react";

const QUICK_AMOUNTS = [500, 1000, 2500, 5000];
const MEDIA_OPTIONS = [
  { value: "", label: "No media" },
  { value: "youtube", label: "YouTube" },
  { value: "gif", label: "GIF" },
  { value: "image", label: "Image" },
];

type CryptoMethod = {
  cid: string;
  currency: string;
  name: string;
  icon?: string;
  priceUsd?: string;
};

// Fallback mapping jika endpoint /payments/currencies belum aktif
// (Plisio butuh whitelist IP). Invoice tetap dibuat sungguhan oleh Plisio.
const DEFAULT_METHODS: CryptoMethod[] = [
  { cid: "BTC", currency: "BTC", name: "Bitcoin" },
  { cid: "SOL", currency: "SOL", name: "Solana" },
  { cid: "ETH", currency: "ETH", name: "Ethereum" },
  { cid: "USDT", currency: "USDT", name: "Tether USD" },
  { cid: "LTC", currency: "LTC", name: "Litecoin" },
  { cid: "BCH", currency: "BCH", name: "Bitcoin Cash" },
  { cid: "DOGE", currency: "DOGE", name: "Dogecoin" },
  { cid: "BNB", currency: "BNB", name: "BNB" },
  { cid: "XRP", currency: "XRP", name: "XRP" },
];

// 3 pilihan utama + "Other coins" dari mapping currency.
const MAIN_COINS = ["BTC", "SOL", "ETH"];

export default function DonatePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const username = params.username;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [amount, setAmount] = useState(100);
  const [mediaType, setMediaType] = useState("");
  const [message, setMessage] = useState("");
  const [methods, setMethods] = useState<CryptoMethod[]>(DEFAULT_METHODS);
  const [currency, setCurrency] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const MAX_MESSAGE = 500;

  useEffect(() => {
    publicApi<PublicProfile>(`/users/${username}`)
      .then((p) => {
        setProfile(p);
        setAmount(p.minimumDonation);
      })
      .catch(() => setNotFound(true));
  }, [username]);

  useEffect(() => {
    publicApi<CryptoMethod[]>("/payments/currencies")
      .then((res) => setMethods(res && res.length > 0 ? res : DEFAULT_METHODS))
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile || !currency) {
      toast.error("Please choose a payment method");
      return;
    }
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    try {
      const result = await publicApi<{ orderId: string }>("/donations", {
        method: "POST",
        body: JSON.stringify({
          username,
          donorName: form.get("donorName"),
          amount,
          currency,
          message: form.get("message"),
          mediaType,
          mediaUrl: form.get("mediaUrl"),
        }),
      });
      router.push(`/payment/${result.orderId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1 items-center justify-center">
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
        <SiteFooter />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/40">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold">
            Media<span className="text-primary">Share</span>
          </Link>
          <Badge variant="outline">/donate/{profile.username}</Badge>
        </div>
      </header>

      <main className="container mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-4 py-10">
        {/* Info kreator, rata kiri */}
        <div className="mb-8 w-full max-w-2xl">
          <h1 className="text-3xl font-extrabold">{profile.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Thank you for your support! 💜
          </p>
        </div>

        {/* Form rata kiri */}
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Send Support</CardTitle>
            <CardDescription>
              Minimum {formatUSD(100)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-5">
              <div>
                <Label>Amount (USD)</Label>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {QUICK_AMOUNTS.map((a) => (
                    <Button
                      key={a}
                      type="button"
                      variant={amount === a ? "default" : "outline"}
                      onClick={() => setAmount(a)}
                    >
                      {formatUSD(a).replace("$", "")}
                    </Button>
                  ))}
                </div>
                <div className="mt-2">
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-lg font-semibold text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={amount / 100}
                      onChange={(e) =>
                        setAmount(Math.round(Number(e.target.value) * 100))
                      }
                      className="pl-7 text-left text-lg font-semibold"
                    />
                  </div>
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

              {/* Pilih crypto */}
              <div>
                <Label>Pay with</Label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MAIN_COINS.map((c) => {
                    const coin = methods.find((m) => m.currency === c);
                    return (
                      <Button
                        key={c}
                        type="button"
                        variant={currency === c ? "default" : "outline"}
                        className="h-auto flex-col gap-1 py-3"
                        onClick={() => {
                          setCurrency(c);
                          setShowMore(false);
                        }}
                      >
                        {coin?.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={coin.icon}
                            alt={c}
                            className="h-7 w-7 rounded-full"
                          />
                        ) : (
                          <span className="text-lg font-extrabold">{c}</span>
                        )}
                        <span className="text-xs">{c}</span>
                      </Button>
                    );
                  })}
                  {(() => {
                    const otherSelected =
                      currency && !MAIN_COINS.includes(currency);
                    const otherCoin = otherSelected
                      ? methods.find((m) => m.currency === currency)
                      : undefined;
                    return (
                      <Button
                        type="button"
                        variant={
                          showMore || otherSelected ? "default" : "outline"
                        }
                        className="h-auto flex-col gap-1 py-3"
                        onClick={() => setShowMore((v) => !v)}
                      >
                        {otherCoin?.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={otherCoin.icon}
                            alt={currency ?? ""}
                            className="h-7 w-7 rounded-full"
                          />
                        ) : otherSelected ? (
                          <span className="text-lg font-extrabold">
                            {currency}
                          </span>
                        ) : (
                          <ChevronDown className="h-6 w-6" />
                        )}
                        <span className="text-xs">
                          {otherSelected
                            ? showMore
                              ? "Choose"
                              : "Change"
                            : "Other coins"}
                        </span>
                      </Button>
                    );
                  })()}
                </div>

                {showMore && (
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-2 sm:grid-cols-4">
                    {methods
                      .filter((m) => !MAIN_COINS.includes(m.currency))
                      .map((m) => (
                        <Button
                          key={m.cid}
                          type="button"
                          variant={currency === m.currency ? "default" : "ghost"}
                          className="justify-start gap-2"
                          onClick={() => {
                            setCurrency(m.currency);
                            setShowMore(false);
                          }}
                        >
                          {m.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.icon}
                              alt={m.name}
                              className="h-5 w-5 rounded-full"
                            />
                          ) : null}
                          {m.currency}
                        </Button>
                      ))}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating
                    invoice...
                  </>
                ) : (
                  `Pay ${formatUSD(amount)} with ${currency ?? "..."}`
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
