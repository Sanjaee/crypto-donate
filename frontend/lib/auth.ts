import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// All env below is read AT RUNTIME (bracket notation so it is not
// inlined at build time), so the Docker image does not embed secrets.
const API_BASE =
  process.env["API_INTERNAL_URL"] || process.env["NEXT_PUBLIC_API_URL"] || "";

function internalHeaders(): Record<string, string> {
  const tok = process.env["INTERNAL_API_TOKEN"] || "";
  return {
    "Content-Type": "application/json",
    "X-Internal-Token": tok,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  providers: [
    Google({
      clientId: process.env["GOOGLE_CLIENT_ID"] || "",
      clientSecret: process.env["GOOGLE_CLIENT_SECRET"] || "",
      checks: ["pkce", "state"],
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Google: find-or-create user di Go API (internal).
      if (account?.provider === "google") {
        try {
          const res = await fetch(`${API_BASE}/auth/oauth`, {
            method: "POST",
            headers: internalHeaders(),
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              googleId: account.providerAccountId,
              avatarUrl: user.image || "",
            }),
          });
          if (!res.ok) return false;
          const json = await res.json();
          const goUser = json?.data;
          if (!goUser?.id) return false;
          user.id = goUser.id;
          (user as { username?: string }).username = goUser.username;
          (user as { role?: string }).role = goUser.role;
        } catch {
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id;
        token.username = (user as { username?: string }).username;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.username = (token.username as string) ?? "";
        session.user.role = (token.role as string) ?? "USER";
      }
      return session;
    },
  },
});
