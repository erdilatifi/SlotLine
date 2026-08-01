import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { computeAvailability } from "./engine";
import type { WeeklyRule } from "./rules";

function localMillis(iso: string, zone: string): number {
  const dt = DateTime.fromISO(iso, { zone });
  if (!dt.isValid) throw new Error(`invalid: ${iso} ${dt.invalidReason}`);
  return dt.toMillis();
}

describe("computeAvailability — Figure 7.1 worked example", () => {
  // One staff member, one day, one service, replicated exactly from the
  // handbook: Monday 09:00-17:00 local, a lunch block, an existing booking
  // inflated by buffers, 2h minimum notice with "now" at 09:00, a 30-minute
  // grid, and a 45-minute service.
  const zone = "Europe/Belgrade";
  const monday: WeeklyRule = {
    weekday: 1,
    startLocal: { hour: 9, minute: 0 },
    endLocal: { hour: 17, minute: 0 },
  };

  const result = computeAvailability({
    zone,
    weeklyRules: [monday],
    dateOverrides: [],
    timeOff: [
      // Lunch block, 12:00-13:00 local.
      {
        start: localMillis("2026-03-23T12:00:00", zone),
        end: localMillis("2026-03-23T13:00:00", zone),
      },
    ],
    busy: [
      // An existing booking, 10:00-10:45 local, before buffers.
      {
        start: localMillis("2026-03-23T10:00:00", zone),
        end: localMillis("2026-03-23T10:45:00", zone),
      },
    ],
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
    minimumNoticeMinutes: 120,
    horizonDays: 1,
    slotGranularityMinutes: 30,
    serviceDurationMinutes: 45,
    now: localMillis("2026-03-23T09:00:00", zone),
  });

  const resultLocal = result.map((instant) =>
    DateTime.fromMillis(instant, { zone }).toFormat("HH:mm"),
  );

  it("returns exactly the 8 slots the handbook's worked example lists", () => {
    expect(resultLocal).toEqual([
      "11:00",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
    ]);
  });

  it("excludes 11:30 — it would end at 12:15, inside the lunch block", () => {
    expect(resultLocal).not.toContain("11:30");
  });

  it("excludes 16:30 — it would end at 17:15, past closing", () => {
    expect(resultLocal).not.toContain("16:30");
  });

  it("excludes anything before 11:00 — inside the 2-hour minimum-notice window from a 09:00 'now'", () => {
    for (const time of resultLocal) {
      expect(time >= "11:00").toBe(true);
    }
  });
});

describe("computeAvailability — smaller scenarios", () => {
  const zone = "UTC";
  const mondayNineToFive: WeeklyRule = {
    weekday: 1,
    startLocal: { hour: 9, minute: 0 },
    endLocal: { hour: 17, minute: 0 },
  };

  it("returns nothing when no weekly rule matches any date in the horizon", () => {
    const result = computeAvailability({
      zone,
      weeklyRules: [
        { weekday: 2, startLocal: { hour: 9, minute: 0 }, endLocal: { hour: 17, minute: 0 } },
      ],
      dateOverrides: [],
      timeOff: [],
      busy: [],
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      horizonDays: 1,
      slotGranularityMinutes: 30,
      serviceDurationMinutes: 30,
      now: localMillis("2026-03-23T09:00:00", zone), // a Monday; rule is for Tuesday
    });
    expect(result).toEqual([]);
  });

  it("a date override closing the day removes every slot the weekly rule would have opened", () => {
    const result = computeAvailability({
      zone,
      weeklyRules: [mondayNineToFive],
      dateOverrides: [{ date: { year: 2026, month: 3, day: 23 }, hours: null }],
      timeOff: [],
      busy: [],
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      horizonDays: 1,
      slotGranularityMinutes: 30,
      serviceDurationMinutes: 30,
      now: localMillis("2026-03-23T00:00:00", zone),
    });
    expect(result).toEqual([]);
  });

  it("a service duration longer than any open interval yields no slots", () => {
    const result = computeAvailability({
      zone,
      weeklyRules: [mondayNineToFive],
      dateOverrides: [],
      timeOff: [],
      busy: [],
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      horizonDays: 1,
      slotGranularityMinutes: 30,
      serviceDurationMinutes: 600, // 10 hours — longer than the 9-17 window
      now: localMillis("2026-03-23T00:00:00", zone),
    });
    expect(result).toEqual([]);
  });
});

describe("computeAvailability — DST transition (Figure 7.2)", () => {
  const zone = "Europe/Belgrade";
  const monday: WeeklyRule = {
    weekday: 1,
    startLocal: { hour: 9, minute: 0 },
    endLocal: { hour: 17, minute: 0 },
  };

  it("the same declared rule produces a UTC window shifted by one hour across the transition", () => {
    const beforeTransition = computeAvailability({
      zone,
      weeklyRules: [monday],
      dateOverrides: [],
      timeOff: [],
      busy: [],
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      horizonDays: 1,
      slotGranularityMinutes: 60,
      serviceDurationMinutes: 60,
      now: localMillis("2026-03-16T00:00:00", zone), // the Monday before the transition
    });
    const afterTransition = computeAvailability({
      zone,
      weeklyRules: [monday],
      dateOverrides: [],
      timeOff: [],
      busy: [],
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 0,
      horizonDays: 1,
      slotGranularityMinutes: 60,
      serviceDurationMinutes: 60,
      now: localMillis("2026-03-30T00:00:00", zone), // the Monday after the transition
    });

    // Same local times either side of the boundary...
    expect(beforeTransition.map((i) => DateTime.fromMillis(i, { zone }).toFormat("HH:mm"))).toEqual(
      afterTransition.map((i) => DateTime.fromMillis(i, { zone }).toFormat("HH:mm")),
    );
    // ...but a different UTC instant, because the rule was never stored as
    // a fixed UTC instant in the first place (ADR-0007).
    expect(beforeTransition[0]).not.toBe(afterTransition[0]);
    expect(DateTime.fromMillis(beforeTransition[0]!, { zone: "utc" }).hour).toBe(8);
    expect(DateTime.fromMillis(afterTransition[0]!, { zone: "utc" }).hour).toBe(7);
  });
});
