import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Tile({
  className,
  eyebrow,
  title,
  body,
  children,
}: {
  className?: string;
  eyebrow?: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "spotlight group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface",
        "transition-[border-color,box-shadow] duration-300 hover:border-ink/12 hover:shadow-card",
        className,
      )}
    >
      <div className="p-6">
        {eyebrow && (
          <p className="mb-2 font-mono text-[11px] tracking-[0.1em] text-accent uppercase">
            {eyebrow}
          </p>
        )}
        <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
      </div>
      {children && <div className="mt-auto px-6 pb-6">{children}</div>}
    </div>
  );
}

/** Two people, one slot — the claim the whole product rests on. */
export function RaceTile() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5 rounded-lg border border-accent/30 bg-accent/6 px-3 py-2.5">
        <Avatar initial="S" highlight />
        <span className="text-[13px] font-medium">Sarah</span>
        <span className="ml-auto flex items-center gap-1.5 text-[12px] font-medium text-accent">
          <Tick />
          Booked
        </span>
      </div>
      <div className="rounded-lg border border-line px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar initial="M" />
          <span className="text-[13px] text-muted">Mike</span>
          <span className="ml-auto text-[12px] text-muted">Just missed it</span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line-soft pt-2.5">
          {["2:30", "3:00", "3:15"].map((time) => (
            <span
              key={time}
              className="rounded-md bg-surface-sunken px-2 py-1 text-[11px] tabular-nums"
            >
              {time} PM
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The subtraction that produces a free time, shown as a stack. */
export function PipelineTile() {
  const rows = [
    ["Your hours", "9:00 – 5:00"],
    ["Minus lunch", "12:00 – 1:00"],
    ["Minus what's booked", "10:00 – 10:45"],
    ["Minus your calendar", "Dentist, 3:00"],
  ];
  return (
    <div className="space-y-1.5">
      {rows.map(([label, detail]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-3 rounded-md border border-line px-3 py-2"
        >
          <span className="text-[12px]">{label}</span>
          <span className="text-[11px] text-muted tabular-nums">{detail}</span>
        </div>
      ))}
      <div className="rounded-md border border-accent/30 bg-accent/8 px-3 py-2">
        <span className="text-[12px] font-medium text-accent">8 times they can book</span>
      </div>
    </div>
  );
}

/** Same wall-clock hour on both sides of a clock change. */
export function ClockTile() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        ["23 March", "before"],
        ["30 March", "after the change"],
      ].map(([date, note]) => (
        <div key={date} className="rounded-lg border border-line px-3 py-2.5 text-center">
          <p className="text-[11px] text-muted">{date}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">9:00</p>
          <p className="mt-0.5 text-[10px] text-muted">{note}</p>
        </div>
      ))}
    </div>
  );
}

/** What the client gets, and what it lets them do without ringing you. */
export function ReminderTile() {
  return (
    <div className="rounded-lg border border-line bg-surface-sunken px-3.5 py-3">
      <p className="text-[11px] text-muted">Tomorrow, 3:00 PM</p>
      <p className="mt-1 text-[13px] font-medium">Cut &amp; finish with Jess</p>
      <div className="mt-2.5 flex gap-1.5">
        <span className="rounded-md border border-line bg-surface px-2 py-1 text-[11px]">
          Change
        </span>
        <span className="rounded-md border border-line bg-surface px-2 py-1 text-[11px]">
          Cancel
        </span>
      </div>
    </div>
  );
}

function Avatar({ initial, highlight }: { initial: string; highlight?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
        highlight ? "bg-accent text-white" : "bg-surface-sunken text-muted ring-1 ring-line",
      )}
    >
      {initial}
    </span>
  );
}

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
