import { cn } from "../lib/cn";

/**
 * Three slots with the last one taken — the product in a glyph. The filled
 * bar reads as "a time chosen out of several", which is the whole job,
 * rather than as a generic stack of lines.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("grid size-7 shrink-0 place-items-center rounded-[0.5rem] bg-ink", className)}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="3" y="2.5" width="10" height="2.2" rx="1.1" fill="white" fillOpacity="0.35" />
        <rect x="3" y="6.9" width="10" height="2.2" rx="1.1" fill="white" fillOpacity="0.35" />
        <rect x="3" y="11.3" width="10" height="2.2" rx="1.1" fill="var(--color-accent-bright)" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">Slotline</span>
    </span>
  );
}
