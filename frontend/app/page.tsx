import Link from "next/link";
import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { LoginButton } from "@/components/login-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sparkles,
  ArrowRight,
  Gift,
  Video,
  Wallet,
  Tv,
  Play,
  CheckCircle2,
  ShieldCheck,
  Radio,
  Heart,
} from "lucide-react";

export default async function LandingPage() {
  const session = await auth();
  const loggedIn = Boolean(session?.user);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* ---------- HERO ---------- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.14),transparent_55%)]"
          />
          <div className="container mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 lg:grid-cols-2 lg:py-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                Media share for every creator
              </div>
              <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Turn donations into{" "}
                <span className="text-primary">live moments</span> on your
                stream
              </h1>
              <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                Give your audience a page to support you — and show their
                YouTube videos, GIFs, and messages on your widget in real time.
                Just light, instant polling.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {loggedIn ? (
                  <>
                    <Button asChild size="lg">
                      <Link href="/dashboard">
                        Open Dashboard <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <Link href="/guide">User Guide</Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <LoginButton size="lg">
                      Get Started — it&apos;s free
                      <ArrowRight className="h-4 w-4" />
                    </LoginButton>
                    <Button asChild size="lg" variant="outline">
                      <Link href="/guide">User Guide</Link>
                    </Button>
                  </>
                )}
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> 2-second
                  delivery
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Verified
                  payments
                </span>
              </div>
            </div>

            {/* Mock widget preview */}
            <div className="relative mx-auto w-full max-w-md">
              <div className="relative overflow-hidden rounded-2xl border bg-zinc-950 shadow-2xl">
                <div className="relative aspect-video w-full overflow-hidden">
                  <video
                    className="absolute inset-0 h-full w-full object-cover"
                    src="/tm.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/50 via-zinc-900/40 to-zinc-950/80" />
                  <div className="relative flex h-full items-center justify-center">
                    <div className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-1.5 text-sm text-white/90 backdrop-blur">
                      <Radio className="h-4 w-4 animate-pulse text-primary" />
                      Live widget
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-white/10 bg-black/60 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    A
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">Andi</p>
                    <p className="text-sm font-bold text-primary">
                      1.000 BTC
                    </p>
                    <p className="text-sm text-white/70">
                      Keep up the great work! 🔥
                    </p>
                  </div>
                  <Heart className="h-5 w-5 fill-primary text-primary" />
                </div>
              </div>
              <div className="absolute -right-4 -top-4 hidden rotate-6 rounded-xl border bg-background px-4 py-3 shadow-lg sm:block">
                <p className="text-xs text-muted-foreground">Payment via</p>
                <p className="font-bold text-primary">Crypto ✓</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- STATS / TRUST BAR ---------- */}
        <section className="border-y bg-muted/40">
          <div className="container mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:grid-cols-4">
            {[
              { icon: Radio, title: "Real-time", desc: "2s polling" },
              { icon: Gift, title: "Any media", desc: "YouTube · GIF · image" },
              { icon: Wallet, title: "Ledger wallet", desc: "Transparent balance" },
              { icon: Tv, title: "Any display", desc: "Browser · TV · OBS source" },
            ].map((s) => (
              <div key={s.title} className="flex flex-col items-center gap-1">
                <s.icon className="h-5 w-5 text-primary" />
                <p className="font-semibold">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- FEATURES ---------- */}
        <section className="container mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight">
              Everything you need to go live with support
            </h2>
            <p className="mt-3 text-muted-foreground">
              A lightweight, secure platform built to run on a single VPS.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Gift,
                title: "Donation Page",
                desc: "Every user gets their own /donate/username page with amounts, messages, and media.",
              },
              {
                icon: Video,
                title: "Real-time Media",
                desc: "YouTube, GIFs, and images appear on the widget the moment payment is confirmed.",
              },
              {
                icon: Wallet,
                title: "Wallet Ledger",
                desc: "Every credit and fee is recorded. Your balance is always transparent and auditable.",
              },
              {
                icon: Tv,
                title: "Lightweight Widget",
                desc: "Open it in a browser, second monitor, TV, or as an OBS browser source.",
              },
            ].map((f) => (
              <Card key={f.title} className="transition-shadow hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {f.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ---------- HOW IT WORKS ---------- */}
        <section className="border-y bg-muted/40 py-20">
          <div className="container mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-extrabold tracking-tight">
                Live in three simple steps
              </h2>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Create your page",
                  desc: "Sign up and get your own /donate/username page plus a unique widget link.",
                },
                {
                  step: "02",
                  title: "Open the widget",
                  desc: "Put your widget on a browser, TV, or OBS source. It waits quietly for donations.",
                },
                {
                  step: "03",
                  title: "Get donations live",
                  desc: "Supporters pay via crypto — their media plays on your widget instantly.",
                },
              ].map((s) => (
                <div key={s.step} className="relative text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-extrabold text-primary-foreground">
                    {s.step}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {s.desc}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Button asChild variant="outline" size="lg">
                <Link href="/guide">
                  Read the full user guide <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-muted/30 py-8">
        <div className="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row">
          <p className="font-bold">
            Media<span className="text-primary">Share</span>
          </p>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} MediaShare ·{" "}
            <Link href="/guide" className="hover:text-foreground">
              User Guide
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
