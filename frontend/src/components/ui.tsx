import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "../lib/cn";

/* Generous hit areas throughout — Fitts's law applies as much to a 44px
   phone tap target as to a desktop pointer. */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "light" | "onDark";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // The inset highlight is what stops a solid dark button reading as a
  // flat rectangle — it suggests a lit edge.
  primary:
    "bg-ink text-white shadow-subtle hover:bg-ink-soft active:translate-y-px " +
    "shadow-[inset_0_1px_0_oklch(1_0_0/0.12)]",
  secondary:
    "bg-surface text-ink border border-line shadow-subtle hover:border-ink/20 hover:bg-surface-sunken active:translate-y-px",
  ghost: "text-ink-soft hover:text-ink hover:bg-surface-sunken",
  danger: "text-red-600 hover:bg-red-50",

  // For the gradient hero and the dark CTA: solid white reads as the
  // primary action against colour, where near-black would disappear.
  light: "sheen bg-white text-ink shadow-lift hover:bg-white/92 active:translate-y-px",
  onDark:
    "bg-white/10 text-white ring-1 ring-white/20 backdrop-blur hover:bg-white/18 active:translate-y-px",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
        "transition-[background-color,border-color,transform,box-shadow] duration-150",
        "disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm",
        "shadow-[inset_0_1px_2px_oklch(0.16_0.014_265/0.04)]",
        "transition-colors duration-150 placeholder:text-muted hover:border-ink/15",
        "focus:border-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-lg border border-line bg-surface px-2 text-[13px] tabular-nums",
        "transition-colors duration-150 hover:border-ink/15 focus:border-accent/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({
  className,
  children,
  interactive,
}: {
  className?: string;
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface-raised shadow-card",
        interactive &&
          "transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-ink/12 hover:shadow-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "muted" | "positive" | "warning";
}) {
  const tones = {
    neutral: "bg-surface-sunken text-ink-soft ring-1 ring-line",
    accent: "bg-accent/8 text-accent ring-1 ring-accent/15",
    muted: "bg-surface-sunken text-muted ring-1 ring-line",
    positive: "bg-positive/10 text-positive ring-1 ring-positive/20",
    warning: "bg-warning/10 text-warning ring-1 ring-warning/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** A page heading with optional actions on the right. Every dashboard page
 *  opens the same way, so the eye lands in the same place each time. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-surface-sunken p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-[background-color,color,box-shadow] duration-150",
            value === option.value
              ? "bg-surface font-medium text-ink shadow-subtle"
              : "text-muted hover:text-ink",
          )}
        >
          {option.label}
          {option.count !== undefined && option.count > 0 && (
            <span className="text-[11px] text-muted tabular-nums">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 text-sm"
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-accent" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white shadow-subtle transition-transform duration-200",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}

/** Errors sit where the action was, not in a corner — nobody hunts for them. */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100"
    >
      {children}
    </p>
  );
}

/** Skeletons keep layout stable so nothing jumps when data lands. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-sunken", className)} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string | undefined }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-sunken/50 px-4 py-10 text-center">
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{hint}</p>}
    </div>
  );
}
