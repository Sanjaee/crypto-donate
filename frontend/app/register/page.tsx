import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import RegisterForm from "./register-form";

// Jika sudah login, /register tidak perlu diakses — langsung ke dashboard.
export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }
  return <RegisterForm />;
}
