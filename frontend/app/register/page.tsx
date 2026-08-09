import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SiteFooter } from "@/components/site-footer";
import RegisterForm from "./register-form";

// If already signed in, /register is not needed - redirect to the dashboard.
export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <RegisterForm />
      </div>
      <SiteFooter />
    </div>
  );
}
