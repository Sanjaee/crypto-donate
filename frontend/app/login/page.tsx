import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import LoginForm from "./login-form";

// Jika sudah login, /login tidak perlu diakses — langsung ke dashboard.
export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }
  return <LoginForm />;
}
