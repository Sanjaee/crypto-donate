import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { API_BASE } from "@/lib/api";

// Proxy /app-api/* -> Go API internal (dengan internal token + user id dari session).
export const dynamic = "force-dynamic";

async function proxy(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const path = req.nextUrl.pathname.replace(/^\/app-api/, "");
  const query = req.nextUrl.search;
  const url = `${API_BASE}${path}${query}`;

  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await req.arrayBuffer();

  const headers: Record<string, string> = {
    "X-Internal-Token": process.env.INTERNAL_API_TOKEN || "",
    "X-User-ID": userId,
  };
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "internal api unreachable" },
      { status: 502 },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
