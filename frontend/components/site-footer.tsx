import Link from "next/link";

export function SiteFooter() {
  return (
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
  );
}
