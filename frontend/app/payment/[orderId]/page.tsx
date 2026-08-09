"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatUSD } from "@/lib/format";
import { publicApi } from "@/lib/api";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Copy,
  Loader2,
  QrCode,
  CheckCircle2,
  Clock,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const POLL_MS = 3000;

type PaymentStatus = {
  orderId: string;
  status: string;
  currency?: string;
  cryptoAmount?: string;
  walletHash?: string;
  qrCode?: string;
  grossAmount: number;
};

export default function PaymentPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [data, setData] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function poll() {
      try {
        const res = await publicApi<PaymentStatus>(
          `/payments/${orderId}/status`,
        );
        if (stopped) return;
        setData(res);
        setLoading(false);
      } catch (err) {
        if (stopped) return;
        setError(err instanceof Error ? err.message : "Transaction not found");
        setLoading(false);
      }
    }

    poll();
    timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [orderId]);

  async function copyAddress() {
    if (!data?.walletHash) return;
    try {
      await navigator.clipboard.writeText(data.walletHash);
      toast.success("Address copied");
    } catch {
      toast.error("Failed to copy address");
    }
  }

  async function copyAmount() {
    if (!data?.cryptoAmount) return;
    try {
      await navigator.clipboard.writeText(
        `${data.cryptoAmount} ${data.currency || ""}`.trim(),
      );
      toast.success("Amount copied");
    } catch {
      toast.error("Failed to copy amount");
    }
  }

  const isPaid = data?.status === "PAID";
  const isExpired = data?.status === "EXPIRED";
  const isCancelled = data?.status === "CANCELLED";
  const isPending = data && !isPaid && !isExpired && !isCancelled;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-muted/40">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-bold">
            Media<span className="text-primary">Share</span>
          </Link>
          <span className="font-mono text-xs text-muted-foreground">
            {orderId}
          </span>
        </div>
      </header>

      <main className="container mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-4 py-10">
        {error ? (
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="font-semibold">Transaction not found</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button asChild variant="outline">
                <Link href="/">Go back</Link>
              </Button>
            </CardContent>
          </Card>
        ) : loading && !data ? (
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading payment...</p>
            </CardContent>
          </Card>
        ) : data && isPaid ? (
          // ---------- SUCCESS ----------
          <Card className="w-full max-w-md border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <CheckCircle2 className="h-16 w-16 text-emerald-500" />
              <h2 className="text-2xl font-extrabold">Payment confirmed!</h2>
              <p className="text-sm text-muted-foreground">
                Your {formatUSD(data.grossAmount)} support is live. The media
                will play on the widget automatically.
              </p>
              <div className="rounded-lg bg-background px-4 py-2 text-sm">
                <span className="text-muted-foreground">Paid in </span>
                <span className="font-semibold">
                  {data.cryptoAmount || "—"} {data.currency || "BTC"}
                </span>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/">Done</Link>
              </Button>
            </CardContent>
          </Card>
        ) : data && (isExpired || isCancelled) ? (
          // ---------- EXPIRED / CANCELLED ----------
          <Card className="w-full max-w-md">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <XCircle className="h-14 w-14 text-muted-foreground" />
              <h2 className="text-xl font-bold">
                {isExpired ? "Payment expired" : "Payment cancelled"}
              </h2>
              <p className="text-sm text-muted-foreground">
                No payment was received. You can try again.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/">Go back</Link>
              </Button>
            </CardContent>
          </Card>
        ) : data && isPending ? (
          // ---------- PENDING (QR) ----------
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <QrCode className="h-5 w-5 text-primary" /> Scan to pay with{" "}
                {data.currency || "BTC"}
              </CardTitle>
              <CardDescription>
                Pay {formatUSD(data.grossAmount)} in crypto. Your media will
                play on the widget automatically once confirmed.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {data.qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.qrCode}
                  alt={`${data.currency} payment QR code`}
                  className="h-72 w-72 rounded-xl border bg-white p-2"
                />
              ) : (
                <div className="flex h-72 w-72 items-center justify-center rounded-xl border bg-muted">
                  <QrCode className="h-12 w-12 text-muted-foreground" />
                </div>
              )}

              {(data.cryptoAmount || data.currency) && (
                <div className="flex items-center gap-2">
                  <p className="text-3xl font-extrabold">
                    {data.cryptoAmount || "—"}{" "}
                    <span className="text-primary">
                      {data.currency || "BTC"}
                    </span>
                  </p>
                  {data.cryptoAmount && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={copyAmount}
                      title="Copy amount"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}

              {data.walletHash && (
                <div className="w-full rounded-xl border bg-muted p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="h-4 w-4" /> Send to this address
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={copyAddress}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                  <code className="block break-all text-sm font-semibold">
                    {data.walletHash}
                  </code>
                </div>
              )}

              {/* Status pending = loading */}
              <div className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                <div className="flex-1 text-left text-sm">
                  <p className="font-semibold">Waiting for payment...</p>
                  <p className="text-xs text-muted-foreground">
                    Checking payment status. Once confirmed on the network,
                    this page updates automatically.
                  </p>
                </div>
              </div>
              <div className="flex w-full items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                Loading payment status...
              </div>

              <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                Invoice expires in 60 minutes.
              </div>
            </CardContent>
          </Card>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
