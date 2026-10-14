import { describe, it, expect } from "vitest";
import { gestureIntent, nextUnopened, nextChapter } from "../ritualGestures";
import { monthGrid, shiftMonth, localReadingDay } from "../journalCalendar";
import { sanitizeProgress, storageKey, anchorScrollTop } from "../ritualState";
describe("reading gestures preserve text scrolling", () => {
  it("only a new gesture at a boundary changes a chapter", () => {
    expect(
      gestureIntent(
        { x: 0, y: 0, top: false, bottom: false },
        { x: 2, y: -150 },
      ),
    ).toBe(null);
    expect(
      gestureIntent({ x: 0, y: 0, top: false, bottom: true }, { x: 2, y: -90 }),
    ).toBe("next");
    expect(
      gestureIntent({ x: 0, y: 0, top: true, bottom: false }, { x: 2, y: 90 }),
    ).toBe("previous");
    expect(
      gestureIntent(
        { x: 100, y: 0, top: false, bottom: false },
        { x: 10, y: 3 },
      ),
    ).toBe("table");
    expect(
      gestureIntent(
        { x: 0, y: 0, top: false, bottom: true },
        { x: -70, y: -100 },
      ),
    ).toBe(null);
  });
  it("progress never skips a hidden card or loops after completion", () => {
    expect(nextUnopened([0, 2], 2, 4)).toBe(3);
    expect(nextUnopened([2, 3], 3, 4)).toBe(0);
    expect(nextUnopened([0, 1, 2], 2, 3)).toBe(null);
  });
  it("cleans stale card indices and scopes storage to DB and owner", () => {
    expect(
      sanitizeProgress({ index: 7, revealed: [-1, 0, 0, 5] }, 3),
    ).toMatchObject({ index: 2, revealed: [0] });
    expect(storageKey("db-a", 1)).not.toBe(storageKey("db-b", 1));
    expect(storageKey("db-a", 1)).not.toBe(storageKey("db-a", 2));
  });
});
describe("journal dates", () => {
  it("Monday first calendar handles leap years and month navigation", () => {
    expect(monthGrid(2024, 1).filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2026, 9).slice(0, 4)).toEqual([null, null, null, 1]);
    expect(shiftMonth(2026, 11, 1)).toEqual([2027, 0]);
    expect(shiftMonth(2026, 0, -1)).toEqual([2025, 11]);
  });
  it("SQLite UTC dates and ISO timestamps share a local day", () => {
    expect(localReadingDay("2026-10-14 00:30:00")).toBe(
      localReadingDay("2026-10-14T00:30:00Z"),
    );
    expect(localReadingDay("bad")).toBe("");
  });
});

it("can move forward again after revisiting an opened card", () => {
  expect(nextChapter([0, 1, 2], 0, 3)).toBe(1);
  expect(nextChapter([0, 1, 2], 2, 3)).toBe(null);
  expect(nextChapter([1, 2], 2, 3)).toBe(0);
});
it("restores an anchor relative to the scroll viewport, independent of offset parent", () => {
  expect(anchorScrollTop(0, 120, 30, 240)).toBe(330);
  expect(anchorScrollTop(0, 120, 30, -90)).toBe(0);
  expect(anchorScrollTop(200, -80, 30, 240)).toBe(330);
});
