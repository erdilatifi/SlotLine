import { describe, expect, it } from "vitest";
import { fits, intersect, isEmpty, merge, subtract, subtractAll } from "./interval";

describe("isEmpty", () => {
  it("is empty when start equals end", () => {
    expect(isEmpty({ start: 10, end: 10 })).toBe(true);
  });

  it("is empty when start is after end", () => {
    expect(isEmpty({ start: 10, end: 5 })).toBe(true);
  });

  it("is not empty when start is before end", () => {
    expect(isEmpty({ start: 5, end: 10 })).toBe(false);
  });
});

describe("merge", () => {
  it("merges overlapping intervals", () => {
    expect(
      merge([
        { start: 0, end: 10 },
        { start: 5, end: 15 },
      ]),
    ).toEqual([{ start: 0, end: 15 }]);
  });

  it("merges touching intervals (half-open adjacency)", () => {
    expect(
      merge([
        { start: 0, end: 10 },
        { start: 10, end: 20 },
      ]),
    ).toEqual([{ start: 0, end: 20 }]);
  });

  it("keeps disjoint intervals separate", () => {
    expect(
      merge([
        { start: 0, end: 10 },
        { start: 20, end: 30 },
      ]),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 30 },
    ]);
  });

  it("sorts unordered input", () => {
    expect(
      merge([
        { start: 20, end: 30 },
        { start: 0, end: 10 },
      ]),
    ).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 30 },
    ]);
  });

  it("drops empty intervals", () => {
    expect(
      merge([
        { start: 5, end: 5 },
        { start: 0, end: 10 },
      ]),
    ).toEqual([{ start: 0, end: 10 }]);
  });
});

describe("intersect", () => {
  it("returns the overlap of two intervals", () => {
    expect(intersect({ start: 0, end: 10 }, { start: 5, end: 15 })).toEqual({ start: 5, end: 10 });
  });

  it("returns null for disjoint intervals", () => {
    expect(intersect({ start: 0, end: 10 }, { start: 10, end: 20 })).toBeNull();
  });
});

describe("subtract — the five overlap relations", () => {
  const from = { start: 10, end: 20 };

  it("disjoint: remove entirely before — from is unchanged", () => {
    expect(subtract(from, { start: 0, end: 5 })).toEqual([from]);
  });

  it("disjoint: remove entirely after — from is unchanged", () => {
    expect(subtract(from, { start: 25, end: 30 })).toEqual([from]);
  });

  it("overlaps the left edge — returns the trailing remainder", () => {
    expect(subtract(from, { start: 0, end: 15 })).toEqual([{ start: 15, end: 20 }]);
  });

  it("fully contained — splits from into two", () => {
    expect(subtract(from, { start: 12, end: 15 })).toEqual([
      { start: 10, end: 12 },
      { start: 15, end: 20 },
    ]);
  });

  it("overlaps the right edge — returns the leading remainder", () => {
    expect(subtract(from, { start: 15, end: 25 })).toEqual([{ start: 10, end: 15 }]);
  });

  it("fully covers from — returns nothing", () => {
    expect(subtract(from, { start: 5, end: 25 })).toEqual([]);
  });

  it("exactly equal — returns nothing", () => {
    expect(subtract(from, { start: 10, end: 20 })).toEqual([]);
  });

  it("touching at the boundary does not overlap (half-open)", () => {
    expect(subtract(from, { start: 20, end: 30 })).toEqual([from]);
    expect(subtract(from, { start: 0, end: 10 })).toEqual([from]);
  });
});

describe("subtractAll", () => {
  it("subtracts multiple removals from multiple intervals", () => {
    const from = [{ start: 0, end: 100 }];
    const removals = [
      { start: 10, end: 20 },
      { start: 50, end: 60 },
    ];
    expect(subtractAll(from, removals)).toEqual([
      { start: 0, end: 10 },
      { start: 20, end: 50 },
      { start: 60, end: 100 },
    ]);
  });
});

describe("fits", () => {
  const container = { start: 0, end: 100 };

  it("fits when the duration lands entirely inside", () => {
    expect(fits(container, 10, 30)).toBe(true);
  });

  it("does not fit when it runs past the end", () => {
    expect(fits(container, 90, 30)).toBe(false);
  });

  it("does not fit when it starts before the container", () => {
    expect(fits(container, -10, 30)).toBe(false);
  });

  it("fits exactly at the boundary", () => {
    expect(fits(container, 0, 100)).toBe(true);
  });
});
