import Link from "next/link";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LoginButton } from "@/components/login-dialog";

export async function SiteHeader() {
  const session = await auth();
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-bold tracking-tight">
          Media<span className="text-primary">Share</span>
        </Link>
        <nav className="flex items-center gap-2">
          {session?.user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/dashboard/mediashare">My Widget</Link>
              </Button>
            </>
          ) : (
            <LoginButton size="sm">Log in</LoginButton>
          )}
        </nav>
      </div>
    </header>
  );
}
