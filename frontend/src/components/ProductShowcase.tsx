import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30"];
const TAKEN = new Set(["10:30", "13:00"]);

const AGENDA = [
  { time: "09:00", name: "Sarah Chen", service: "Men's cut" },
  { time: "10:30", name: "Mike Torres", service: "Cut & beard" },
  { time: "13:00", name: "Dana Whitfield", service: "Men's cut" },
];

/**
 * Both sides of the product at once — what a client sees, and what the
 * owner sees — because "the same appointment, two views" is the thing a
 * paragraph takes three sentences to say.
 */
export function ProductShowcase() {
  const [selected, setSelected] = useState(2);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setSelected((current) => {
        let next = current;
        do {
          next = (next + 1) % SLOTS.length;
        } while (TAKEN.has(SLOTS[next]!));
        return next;
      });
    }, 2400);
    return () => clearInterval(id);
  }, [reduced]);

  // The glow bleeds past the card on purpose; clipping the x-axis stops that
  // bleed from widening the whole page on narrow screens.
  return (
    <div className="relative overflow-x-clip">
      <div className="pointer-events-none absolute -inset-16 glow-behind" />

      <div className="relative rounded-xl border border-line bg-surface shadow-lift">
        {/* A window chrome bar reads as "this is the real product" far
            faster than a caption saying so. */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
          </span>
          <span className="ml-2 font-mono text-[11px] text-muted">
            slotline.app/book/riverside-barbers
          </span>
        </div>

        <div className="grid gap-px bg-line sm:grid-cols-[1.15fr_1fr]">
          {/* Client side */}
          <div className="bg-surface p-5">
            <p className="text-[10px] font-medium tracking-[0.1em] text-muted uppercase">
              What your client sees
            </p>

            <div className="mt-4 flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink">Men's cut · 30 min</p>
              <span className="font-mono text-[11px] text-muted">Thu 14</span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {SLOTS.map((slot, i) => {
                const taken = TAKEN.has(slot);
                const active = i === selected;
                return (
                  <div
                    key={slot}
                    className={[
                      "relative rounded-md py-2 text-center font-mono text-[11px] transition-colors duration-300",
                      taken
                        ? "text-muted/35 line-through"
                        : active
                          ? "text-white"
                          : "text-muted ring-1 ring-line",
                    ].join(" ")}
                  >
                    {active && !taken && (
                      <motion.span
                        layoutId="showcase-slot"
                        className="absolute inset-0 rounded-md bg-accent"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative">{slot}</span>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-[11px] text-muted">
              Two times already gone — worked out the moment they opened it.
            </p>
          </div>

          {/* Owner side */}
          <div className="bg-surface p-5">
            <p className="text-[10px] font-medium tracking-[0.1em] text-muted uppercase">
              What you see
            </p>

            <div className="mt-4 flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink">Today</p>
              <span className="font-mono text-[11px] text-muted">3 booked</span>
            </div>

            <div className="mt-3 space-y-1.5">
              {AGENDA.map((row) => (
                <div
                  key={row.time}
                  className="flex items-center gap-2.5 rounded-md border border-line px-2.5 py-2"
                >
                  <span className="font-mono text-[11px] text-accent-bright">{row.time}</span>
                  <span className="truncate text-[11px] text-ink">{row.name}</span>
                  <span className="ml-auto truncate text-[10px] text-muted">{row.service}</span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[11px] text-muted">
              Never two people in the same chair at the same time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
