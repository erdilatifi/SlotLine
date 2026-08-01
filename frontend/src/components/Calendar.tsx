import { cn } from "../lib/cn";

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/**
 * Builds the 6×7 grid, padded so the 1st lands under the right weekday.
 * Weeks start on Monday, which is what a business thinks in. Always six
 * rows, so stepping between months doesn't resize the card under the cursor.
 */
function monthGrid(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const lead = (first.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

export function Calendar({
  month,
  selected,
  availableDays,
  onSelect,
  onMonthChange,
}: {
  month: Date;
  selected: Date | null;
  /** Day keys (toDateString) that have at least one bookable slot. */
  availableDays: Set<string>;
  onSelect: (date: Date) => void;
  onMonthChange: (month: Date) => void;
}) {
  const cells = monthGrid(month);
  const today = new Date();
  const monthLabel = month.toLocaleDateString([], { month: "long", year: "numeric" });

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-subtle">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          className="grid size-8 place-items-center rounded-lg text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-sunken hover:text-ink active:scale-90"
        >
          ‹
        </button>
        <p className="text-sm font-medium">{monthLabel}</p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          className="grid size-8 place-items-center rounded-lg text-muted transition-[background-color,color,transform] duration-150 hover:bg-surface-sunken hover:text-ink active:scale-90"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i} className="py-1 text-center text-[11px] font-medium text-muted">
            {label}
          </span>
        ))}

        {cells.map((date, i) => {
          if (!date) return <span key={`pad-${i}`} />;

          const available = availableDays.has(date.toDateString());
          const isSelected = selected !== null && isSameDay(date, selected);
          const isToday = isSameDay(date, today);

          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={!available}
              aria-pressed={isSelected}
              onClick={() => onSelect(date)}
              className={cn(
                "group relative grid aspect-square place-items-center rounded-lg text-[13px]",
                "transition-[background-color,color,transform] duration-150",
                isSelected
                  ? "animate-day-pop bg-ink font-medium text-white"
                  : available
                    ? "font-medium text-ink hover:-translate-y-0.5 hover:bg-surface-sunken"
                    : "cursor-not-allowed text-muted/35",
              )}
            >
              {date.getDate()}
              {/* A dot rather than a colour change, so "has availability"
                  and "is selected" stay independently readable. */}
              {available && !isSelected && (
                <span className="absolute bottom-1 size-1 rounded-full bg-accent transition-transform duration-150 group-hover:scale-125" />
              )}
              {isToday && !isSelected && (
                <span className="absolute inset-0 rounded-lg ring-1 ring-line" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
