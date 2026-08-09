import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Gift,
  Video,
  Wallet,
  Sparkles,
  Tv,
  Globe,
  ArrowRight,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="container mx-auto max-w-6xl px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" /> Media share for every creator
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Receive support &amp; display media{" "}
            <span className="text-primary">in real time</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Create your own donation page, accept gifts/support from your
            audience, and show YouTube/GIF/media live on your widget — no OBS,
            no Redis, just light polling.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/register">
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </section>

        <section className="container mx-auto max-w-6xl px-4 pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Gift,
                title: "Donation Page",
                desc: "Every user gets their own /donate/username page.",
              },
              {
                icon: Video,
                title: "Real-time Media",
                desc: "YouTube, GIFs, and images show up automatically on the widget.",
              },
              {
                icon: Wallet,
                title: "Wallet Ledger",
                desc: "Balance is fully tracked, transparent, and secure.",
              },
              {
                icon: Tv,
                title: "Lightweight Widget",
                desc: "Open it in a browser, TV, second monitor, or browser source.",
              },
            ].map((f) => (
              <Card key={f.title}>
                <CardContent className="p-6">
                  <f.icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t bg-muted/40 py-16">
          <div className="container mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center">
            <Globe className="h-8 w-8 text-primary" />
            <h2 className="text-2xl font-bold">
              One VPS runs the whole platform
            </h2>
            <p className="max-w-2xl text-muted-foreground">
              Next.js + Go (Gin &amp; GORM) + PostgreSQL + Nginx + Docker
              Compose. Payments are confirmed via Midtrans webhook with
              signature verification and idempotency.
            </p>
          </div>
        </section>
      </main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} MediaShare
      </footer>
    </div>
  );
}
