import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mail, Phone } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Welcome Back — Echo Mind" },
      { name: "description", content: "Sign in to Echo Mind and continue your learning sessions." },
      { property: "og:title", content: "Welcome Back — Echo Mind" },
      { property: "og:description", content: "Sign in to continue with Echo Mind." },
    ],
  }),
  component: Login,
});

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5z" />
      <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.6 11.6 0 0 0 12 0 12 12 0 0 0 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8z" />
    </svg>
  );
}

function Login() {
  const navigate = useNavigate();
  const go = () => navigate({ to: "/setup" });

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-background px-7 safe-top">
      <div className="flex flex-1 flex-col justify-center pb-20">
        <h1 className="text-center text-[26px] font-semibold tracking-tight">Welcome Back!</h1>
        <p className="mt-1 text-center text-[13px] text-muted-foreground">Sign in to continue</p>

        <div className="mt-10 space-y-3">
          <button onClick={go} className="card-echo flex w-full items-center gap-3 px-5 py-4 text-sm font-medium">
            <GoogleMark />
            Continue with Google
          </button>
          <button onClick={go} className="card-echo flex w-full items-center gap-3 px-5 py-4 text-sm font-medium">
            <Mail className="size-5" strokeWidth={1.7} />
            Continue with Email
          </button>

          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button onClick={go} className="card-echo flex w-full items-center gap-3 px-5 py-4 text-sm font-medium">
            <Phone className="size-5" strokeWidth={1.7} />
            Sign in with Phone
          </button>
        </div>
      </div>

      <p className="pb-8 text-center text-[12px] text-muted-foreground">
        Don't have an account?{" "}
        <Link to="/setup" className="font-medium text-foreground">
          Sign Up
        </Link>
      </p>
    </div>
  );
}
