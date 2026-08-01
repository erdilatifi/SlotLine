import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "./Logo";
import { FadeIn } from "./motion";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-glow">
      <header className="mx-auto w-full max-w-5xl px-6 py-5">
        <Link to="/" className="inline-flex">
          <Logo />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <FadeIn y={10} className="w-full max-w-sm">
          <div className="rounded-2xl border border-line bg-surface-raised p-7 shadow-card">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-ink-soft">{subtitle}</p>
            <div className="mt-6 space-y-4">{children}</div>
          </div>
          <p className="mt-5 text-center text-sm text-muted">{footer}</p>
        </FadeIn>
      </main>
    </div>
  );
}
