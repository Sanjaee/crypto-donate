import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

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
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Google({
      clientId: process.env["GOOGLE_CLIENT_ID"] || "",
      clientSecret: process.env["GOOGLE_CLIENT_SECRET"] || "",
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_BASE}/auth/verify-credentials`, {
            method: "POST",
            headers: internalHeaders(),
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
          if (!res.ok) return null;
          const json = await res.json();
          const user = json?.data;
          if (!user?.id) return null;
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.username,
            image: user.avatarUrl || null,
          };
        } catch {
          return null;
        }
      },
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.username = (token.username as string) ?? "";
      }
      return session;
    },
  },
});
