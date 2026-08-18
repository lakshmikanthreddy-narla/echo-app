import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, FileText, Home, Mic, User } from "lucide-react";
import type { ReactNode } from "react";

const items = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/sessions", label: "Sessions", icon: Mic },
  { to: "/notes", label: "Notes", icon: FileText },
  { to: "/reminders", label: "Reminders", icon: Bell },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-border bg-background/95 backdrop-blur">
      <ul className="safe-bottom grid grid-cols-5 pt-3">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <li key={to}>
              <Link
                to={to}
                className={`flex flex-col items-center gap-1.5 py-1 text-[10px] tracking-tight transition-colors ${
                  active ? "text-primary" : "text-muted-foreground/70"
                }`}
              >
                <Icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.6} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({
  children,
  nav = true,
  className = "",
}: {
  children: ReactNode;
  nav?: boolean;
  className?: string;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <div className={`mx-auto flex min-h-dvh max-w-md flex-col px-5 safe-top ${nav ? "pb-28" : "pb-6"} ${className}`}>
        {children}
      </div>
      {nav ? <BottomNav /> : null}
    </div>
  );
}

export function ScreenHeader({
  title,
  left,
  right,
  subtitle,
}: {
  title: string;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 py-4">
      <div className="w-9">{left}</div>
      <div className="flex-1 text-center">
        <h1 className="text-[17px] font-semibold tracking-tight">{title}</h1>
        {subtitle ? <div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="flex w-9 justify-end">{right}</div>
    </header>
  );
}

export function BackButton({ to }: { to?: string }) {
  return (
    <Link
      to={to ?? "/home"}
      className="flex size-9 items-center justify-center rounded-full text-foreground hover:bg-secondary"
      aria-label="Go back"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div
      className="grid gap-1 rounded-full border border-border bg-surface p-1 text-xs"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full py-2 font-medium transition-colors ${
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card-echo mt-6 p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
