import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  type DateOverride,
  resolveOpenIntervals,
  resolveOpenIntervalsForDate,
  type WeeklyRule,
} from "./rules";

function iso(instant: number): string {
  return DateTime.fromMillis(instant, { zone: "utc" }).toISO() ?? "invalid";
}

describe("resolveOpenIntervalsForDate", () => {
  const mondayNineToFive: WeeklyRule = {
    weekday: 1,
    startLocal: { hour: 9, minute: 0 },
    endLocal: { hour: 17, minute: 0 },
  };

  it("returns nothing for a date with no matching weekly rule and no override", () => {
    // 2026-03-24 is a Tuesday.
    expect(
      resolveOpenIntervalsForDate(
        { year: 2026, month: 3, day: 24 },
        "Europe/Belgrade",
        [mondayNineToFive],
        [],
      ),
    ).toEqual([]);
  });

  it("resolves a weekly rule on its matching weekday", () => {
    // 2026-03-23 is a Monday.
    const result = resolveOpenIntervalsForDate(
      { year: 2026, month: 3, day: 23 },
      "Europe/Belgrade",
      [mondayNineToFive],
      [],
    );
    expect(result).toHaveLength(1);
    expect(iso(result[0]!.start)).toBe("2026-03-23T08:00:00.000Z");
    expect(iso(result[0]!.end)).toBe("2026-03-23T16:00:00.000Z");
  });

  it("supports more than one open interval per day (morning + evening)", () => {
    const morning: WeeklyRule = {
      weekday: 1,
      startLocal: { hour: 9, minute: 0 },
      endLocal: { hour: 12, minute: 0 },
    };
    const evening: WeeklyRule = {
      weekday: 1,
      startLocal: { hour: 17, minute: 0 },
      endLocal: { hour: 20, minute: 0 },
    };
    const result = resolveOpenIntervalsForDate(
      { year: 2026, month: 3, day: 23 },
      "UTC",
      [morning, evening],
      [],
    );
    expect(result).toHaveLength(2);
  });

  it("a date override replaces the weekly rule rather than merging with it", () => {
    const override: DateOverride = {
      date: { year: 2026, month: 3, day: 23 },
      hours: { startLocal: { hour: 9, minute: 0 }, endLocal: { hour: 13, minute: 0 } },
    };
    const result = resolveOpenIntervalsForDate(
      { year: 2026, month: 3, day: 23 },
      "Europe/Belgrade",
      [mondayNineToFive],
      [override],
    );
    expect(result).toHaveLength(1);
    expect(iso(result[0]!.end)).toBe("2026-03-23T12:00:00.000Z"); // 13:00 local (+01:00), not the rule's 17:00
  });

  it("an override with no hours means closed, even on a day the weekly rule would open", () => {
    const closed: DateOverride = { date: { year: 2026, month: 3, day: 23 }, hours: null };
    expect(
      resolveOpenIntervalsForDate(
        { year: 2026, month: 3, day: 23 },
        "Europe/Belgrade",
        [mondayNineToFive],
        [closed],
      ),
    ).toEqual([]);
  });

  it("the same rule resolves to a different UTC window across the DST boundary (Figure 7.2)", () => {
    const beforeDst = resolveOpenIntervalsForDate(
      { year: 2026, month: 3, day: 23 },
      "Europe/Belgrade",
      [mondayNineToFive],
      [],
    );
    const afterDst = resolveOpenIntervalsForDate(
      { year: 2026, month: 3, day: 30 },
      "Europe/Belgrade",
      [mondayNineToFive],
      [],
    );
    expect(iso(beforeDst[0]!.start)).toBe("2026-03-23T08:00:00.000Z");
    expect(iso(afterDst[0]!.start)).toBe("2026-03-30T07:00:00.000Z"); // shifted one hour earlier in UTC
  });
});

describe("resolveOpenIntervals", () => {
  it("resolves across a list of dates in order", () => {
    const mondayNineToFive: WeeklyRule = {
      weekday: 1,
      startLocal: { hour: 9, minute: 0 },
      endLocal: { hour: 17, minute: 0 },
    };
    const dates = [
      { year: 2026, month: 3, day: 23 }, // Monday — open
      { year: 2026, month: 3, day: 24 }, // Tuesday — closed
    ];
    const result = resolveOpenIntervals(dates, "UTC", [mondayNineToFive], []);
    expect(result).toHaveLength(1);
  });
});
