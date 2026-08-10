import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Gift,
  Wallet,
  Tv,
  Settings,
  User,
  Home,
  ExternalLink,
  LogOut,
  ShieldCheck,
  QrCode,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/donations", label: "Donations", icon: Gift },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/mediashare", label: "Media Share", icon: Tv },
  { href: "/dashboard/qr", label: "QR", icon: QrCode },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/profile", label: "Profile", icon: User },
];

const ADMIN_NAV = [
  { href: "/dashboard/admin", label: "Admin", icon: ShieldCheck },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }
  const username = session.user.username;
  const donateUrl = `/donate/${username}`;
  const avatar = session.user.image ?? "";
  const initial = (session.user.name ?? "?")[0]?.toUpperCase() ?? "?";
  const isAdmin = session.user.role === "ADMIN";
  const navItems = isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 md:block">
        <div className="flex h-full flex-col p-4">
          <Link href="/dashboard" className="mb-6 flex items-center font-bold">
            Tip<span className="text-primary">Chain</span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1">
            {navItems.map((item) => (
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
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Navbar top */}
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="flex items-center gap-2">
              {/* Brand (mobile) */}
              <Link href="/" className="font-bold md:hidden">
                Tip<span className="text-primary">Chain</span>
              </Link>
              <span className="hidden text-sm text-muted-foreground md:inline">
                Dashboard
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/">
                  <Home className="h-4 w-4" /> Home
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={donateUrl}>
                  <ExternalLink className="h-4 w-4" /> My Donate Page
                </Link>
              </Button>

              {/* Profile */}
              <div className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-2">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt={session.user.name ?? ""}
                    className="h-7 w-7 rounded-full"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {initial}
                  </span>
                )}
                <div className="hidden sm:block">
                  <p className="text-xs font-semibold leading-tight">
                    {session.user.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    /{username}
                  </p>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Sign out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </header>

        {/* Header mobile (icons) */}
        <header className="sticky top-[57px] z-20 border-b bg-background/80 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-2">
            <nav className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md p-2 text-muted-foreground hover:bg-accent"
                >
                  <item.icon className="h-4 w-4" />
                </Link>
              ))}
            </nav>
            <Link
              href={donateUrl}
              className="flex items-center gap-1 rounded-md p-2 text-muted-foreground hover:bg-accent"
              title="My donate page"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <main className="container mx-auto max-w-5xl flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
