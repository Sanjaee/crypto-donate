import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Gift, Wallet, Tv, Settings, User } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/donations", label: "Donations", icon: Gift },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/mediashare", label: "Media Share", icon: Tv },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/profile", label: "Profile", icon: User },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 md:block">
        <div className="flex h-full flex-col p-4">
          <Link href="/dashboard" className="mb-6 flex items-center font-bold">
            Media<span className="text-primary">Share</span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button type="submit" variant="outline" className="w-full" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/dashboard" className="font-bold">
              Media<span className="text-primary">Share</span>
            </Link>
            <nav className="flex gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md p-2 text-muted-foreground hover:bg-accent"
                >
                  <item.icon className="h-4 w-4" />
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="container mx-auto max-w-5xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
