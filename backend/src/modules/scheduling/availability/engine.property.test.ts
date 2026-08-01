import fc from "fast-check";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { computeAvailability, type AvailabilityInput } from "./engine";
import type { Interval } from "./interval";
import { resolveOpenIntervals } from "./rules";
import { addDays, calendarDateOf } from "./zone";

// A fixed reference instant (a Monday, UTC) so "now" arbitraries land on a
// predictable calendar without dragging DST into properties that aren't
// about DST specifically — that's covered by the targeted tests in
// engine.test.ts and zone.test.ts instead.
const REFERENCE_NOW = DateTime.fromISO("2026-01-05T00:00:00.000Z").toMillis();
const ZONE = "UTC";

const weeklyRuleArb = fc
  .record({
    weekday: fc.integer({ min: 0, max: 6 }),
    startHour: fc.integer({ min: 0, max: 20 }),
    durationHours: fc.integer({ min: 1, max: 3 }),
  })
  .map(({ weekday, startHour, durationHours }) => ({
    weekday,
    startLocal: { hour: startHour, minute: 0 },
    endLocal: { hour: startHour + durationHours, minute: 0 },
  }));

const busyIntervalArb = fc
  .record({
    dayOffset: fc.integer({ min: 0, max: 6 }),
    startHour: fc.integer({ min: 0, max: 22 }),
    durationHours: fc.integer({ min: 1, max: 2 }),
  })
  .map(({ dayOffset, startHour, durationHours }): Interval => {
    const start = REFERENCE_NOW + dayOffset * 86_400_000 + startHour * 3_600_000;
    return { start, end: start + durationHours * 3_600_000 };
  });

function baseInput(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    zone: ZONE,
    weeklyRules: [
      { weekday: 0, startLocal: { hour: 9, minute: 0 }, endLocal: { hour: 17, minute: 0 } },
      { weekday: 1, startLocal: { hour: 9, minute: 0 }, endLocal: { hour: 17, minute: 0 } },
      { weekday: 2, startLocal: { hour: 9, minute: 0 }, endLocal: { hour: 17, minute: 0 } },
      { weekday: 3, startLocal: { hour: 9, minute: 0 }, endLocal: { hour: 17, minute: 0 } },
      { weekday: 4, startLocal: { hour: 9, minute: 0 }, endLocal: { hour: 17, minute: 0 } },
    ],
    dateOverrides: [],
    timeOff: [],
    busy: [],
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minimumNoticeMinutes: 0,
    horizonDays: 7,
    slotGranularityMinutes: 30,
    serviceDurationMinutes: 30,
    now: REFERENCE_NOW,
    ...overrides,
  };
}

describe("property: no returned slot overlaps a busy interval (inflated by buffers)", () => {
  it("holds for any combination of weekly rules and busy intervals", () => {
    fc.assert(
      fc.property(
        fc.array(weeklyRuleArb, { maxLength: 4 }),
        fc.array(busyIntervalArb, { maxLength: 5 }),
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        (weeklyRules, busy, bufferBefore, bufferAfter) => {
          const input = baseInput({
            weeklyRules,
            busy,
            bufferBeforeMinutes: bufferBefore,
            bufferAfterMinutes: bufferAfter,
          });
          const slots = computeAvailability(input);
          const durationMs = input.serviceDurationMinutes * 60_000;
          const inflatedBusy = busy.map((b) => ({
            start: b.start - bufferBefore * 60_000,
            end: b.end + bufferAfter * 60_000,
          }));

          for (const slot of slots) {
            const slotInterval = { start: slot, end: slot + durationMs };
            for (const busyInterval of inflatedBusy) {
              const overlaps =
                slotInterval.start < busyInterval.end && busyInterval.start < slotInterval.end;
              expect(overlaps).toBe(false);
            }
          }
        },
      ),
    );
  });
});

describe("property: every slot, plus its duration, fits inside a resolved open interval", () => {
  it("holds by re-deriving the ground-truth open windows independently", () => {
    fc.assert(
      fc.property(
        fc.array(weeklyRuleArb, { maxLength: 4 }),
        fc.integer({ min: 15, max: 90 }),
        (weeklyRules, durationMinutes) => {
          const input = baseInput({ weeklyRules, serviceDurationMinutes: durationMinutes });
          const slots = computeAvailability(input);

          const dates: { year: number; month: number; day: number }[] = [];
          let current = calendarDateOf(input.now, ZONE);
          const end = calendarDateOf(input.now + input.horizonDays * 86_400_000, ZONE);
          for (let i = 0; i < 10; i++) {
            dates.push(current);
            if (current.year === end.year && current.month === end.month && current.day === end.day)
              break;
            current = addDays(current, 1);
          }
          const groundTruthOpen = resolveOpenIntervals(dates, ZONE, weeklyRules, []);
          const durationMs = durationMinutes * 60_000;

          for (const slot of slots) {
            const fitsSomewhere = groundTruthOpen.some(
              (open) => slot >= open.start && slot + durationMs <= open.end,
            );
            expect(fitsSomewhere).toBe(true);
          }
        },
      ),
    );
  });
});

describe("property: adding a busy interval never increases the number of available slots", () => {
  it("holds for any additional busy interval", () => {
    fc.assert(
      fc.property(
        fc.array(busyIntervalArb, { maxLength: 4 }),
        busyIntervalArb,
        (existingBusy, extraBusy) => {
          const before = computeAvailability(baseInput({ busy: existingBusy }));
          const after = computeAvailability(baseInput({ busy: [...existingBusy, extraBusy] }));
          expect(after.length).toBeLessThanOrEqual(before.length);
        },
      ),
    );
  });
});

describe("property: computing the same inputs twice returns identical output", () => {
  it("holds — no hidden clock reads, no set-ordering nondeterminism", () => {
    fc.assert(
      fc.property(
        fc.array(weeklyRuleArb, { maxLength: 4 }),
        fc.array(busyIntervalArb, { maxLength: 4 }),
        (weeklyRules, busy) => {
          const input = baseInput({ weeklyRules, busy });
          expect(computeAvailability(input)).toEqual(computeAvailability(input));
        },
      ),
    );
  });
});

describe("property: results are unaffected by whatever zone a caller later formats them in", () => {
  it("holds — the engine has no notion of a 'display' zone to leak into the computation", () => {
    const displayZoneArb = fc.constantFrom(
      "UTC",
      "America/New_York",
      "Asia/Kolkata",
      "Pacific/Kiritimati",
    );
    fc.assert(
      fc.property(
        fc.array(weeklyRuleArb, { maxLength: 3 }),
        displayZoneArb,
        displayZoneArb,
        (weeklyRules, zoneA, zoneB) => {
          const input = baseInput({ weeklyRules });
          const result = computeAvailability(input);
          // Formatting in two different zones must not change which
          // underlying instants were selected — only how they're displayed.
          const formattedA = result.map((s) => DateTime.fromMillis(s, { zone: zoneA }).toISO());
          const formattedB = result.map((s) => DateTime.fromMillis(s, { zone: zoneB }).toISO());
          expect(formattedA.map((s) => DateTime.fromISO(s!).toMillis())).toEqual(result);
          expect(formattedB.map((s) => DateTime.fromISO(s!).toMillis())).toEqual(result);
        },
      ),
    );
  });
});

describe("property: every slot is at/after now+minimum notice and before the horizon", () => {
  it("holds for any notice window and horizon", () => {
    fc.assert(
      fc.property(
        fc.array(weeklyRuleArb, { maxLength: 4 }),
        fc.integer({ min: 0, max: 2880 }), // up to 2 days' notice, in minutes
        fc.integer({ min: 1, max: 14 }),
        (weeklyRules, minimumNoticeMinutes, horizonDays) => {
          const input = baseInput({ weeklyRules, minimumNoticeMinutes, horizonDays });
          const slots = computeAvailability(input);
          const earliest = input.now + minimumNoticeMinutes * 60_000;
          const horizon = input.now + horizonDays * 86_400_000;

          for (const slot of slots) {
            expect(slot).toBeGreaterThanOrEqual(earliest);
            expect(slot).toBeLessThan(horizon);
          }
        },
      ),
    );
  });
});
