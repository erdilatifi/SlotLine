import { cn } from "../lib/cn";
import type { DashboardBooking } from "../lib/dashboardApi";

const HOUR_HEIGHT = 56;

/**
 * One day drawn to scale, so a gap between two appointments looks like a
 * gap. A list can tell you there's nothing at 11am; only a column shows
 * you it's an hour wide and worth filling.
 */
export function DaySchedule({
  day,
  bookings,
  onSelect,
}: {
  day: Date;
  bookings: DashboardBooking[];
  onSelect?: (booking: DashboardBooking) => void;
}) {
  const active = bookings.filter((b) => ["CONFIRMED", "PENDING", "COMPLETED"].includes(b.status));

  // Only draw the hours the day actually spans, with an hour of air either
  // side — a fixed midnight-to-midnight column is mostly empty.
  const starts = active.map((b) => new Date(b.startsAt).getHours());
  const ends = active.map((b) => new Date(b.endsAt).getHours() + 1);
  const from = active.length > 0 ? Math.max(0, Math.min(...starts) - 1) : 8;
  const to = active.length > 0 ? Math.min(24, Math.max(...ends) + 1) : 18;
  const hours = Array.from({ length: to - from }, (_, i) => from + i);

  function position(booking: DashboardBooking) {
    const start = new Date(booking.startsAt);
    const end = new Date(booking.endsAt);
    const startHours = start.getHours() + start.getMinutes() / 60 - from;
    const lengthHours = (end.getTime() - start.getTime()) / 3_600_000;
    return {
      top: startHours * HOUR_HEIGHT,
      // A 15-minute appointment still needs to be readable.
      height: Math.max(lengthHours * HOUR_HEIGHT, 26),
    };
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 text-[13px] font-medium">
        {day.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
      </p>

      <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
        {hours.map((hour, i) => (
          <div
            key={hour}
            className="absolute inset-x-0 flex items-start gap-3"
            style={{ top: i * HOUR_HEIGHT }}
          >
            <span className="w-12 shrink-0 text-right text-[11px] text-muted tabular-nums">
              {new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" })}
            </span>
            <span className="mt-1.5 h-px flex-1 bg-line-soft" />
          </div>
        ))}

        <div className="absolute inset-y-0 right-0 left-[3.75rem]">
          {active.map((booking) => {
            const { top, height } = position(booking);
            return (
              <button
                key={booking.id}
                type="button"
                onClick={() => onSelect?.(booking)}
                style={{ top, height }}
                className={cn(
                  "absolute inset-x-0 overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition-[transform,box-shadow] duration-150",
                  onSelect && "hover:-translate-y-px hover:shadow-card",
                  booking.status === "COMPLETED"
                    ? "border-line bg-surface-sunken"
                    : "border-accent/30 bg-accent-soft",
                )}
              >
                <p className="truncate text-[12px] font-medium">
                  {new Date(booking.startsAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {booking.client.name ?? booking.client.email}
                </p>
                {height > 38 && (
                  <p className="truncate text-[11px] text-muted">
                    {booking.service.name} · {booking.staffMember.displayName}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {active.length === 0 && (
        <p className="mt-2 text-center text-[13px] text-muted">Nothing booked this day.</p>
      )}
    </div>
  );
}
