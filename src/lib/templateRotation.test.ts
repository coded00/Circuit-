import { describe, expect, it } from "vitest";
import { ALL_WEEKDAYS, describeWeekdays, lagosDateKey, lagosWeekday, parseWeekdays, templateDue } from "@/lib/templateRotation";

// Lagos is UTC+1 with no daylight saving. 2026-11-02 is a Monday.
const monday = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 2, hour - 1, minute));

describe("Lagos weekday and date", () => {
  it("reads the Lagos calendar, not UTC", () => {
    expect(lagosWeekday(monday(12))).toBe(1);
    expect(lagosDateKey(monday(12))).toBe("2026-11-02");
    // 23:30 UTC on Monday is 00:30 on Tuesday in Lagos.
    expect(lagosWeekday(new Date("2026-11-02T23:30:00Z"))).toBe(2);
    expect(lagosDateKey(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-03");
    // 00:30 Lagos on Monday is still Sunday in UTC.
    expect(lagosWeekday(new Date("2026-11-01T23:30:00Z"))).toBe(1);
  });
});

describe("templateDue", () => {
  const base = { enabled: true, weekdays: [1, 3, 5], launchedOn: null, now: monday(9) };

  it("launches an enabled template on its day, once entries are still open", () => {
    expect(templateDue(base)).toEqual({ due: true, dateKey: "2026-11-02" });
  });

  it("does nothing while it is switched off", () => {
    expect(templateDue({ ...base, enabled: false })).toEqual({ due: false, reason: "OFF" });
  });

  it("waits for its weekdays", () => {
    expect(templateDue({ ...base, weekdays: [2, 4] })).toEqual({ due: false, reason: "NOT_TODAY" });
  });

  it("doesn't launch the same day twice", () => {
    expect(templateDue({ ...base, launchedOn: "2026-11-02" })).toEqual({ due: false, reason: "ALREADY_LAUNCHED" });
    expect(templateDue({ ...base, launchedOn: "2026-10-30" })).toMatchObject({ due: true });
  });

  it("doesn't publish a challenge nobody can enter: not once the day's entries have closed", () => {
    expect(templateDue({ ...base, now: monday(17, 59) })).toMatchObject({ due: true });
    expect(templateDue({ ...base, now: monday(18) })).toEqual({ due: false, reason: "ENTRIES_CLOSED" });
    expect(templateDue({ ...base, now: monday(22) })).toEqual({ due: false, reason: "ENTRIES_CLOSED" });
  });

  it("is due again the next matching day", () => {
    const wednesday = new Date(monday(9).getTime() + 2 * 24 * 3_600_000);
    expect(templateDue({ ...base, launchedOn: "2026-11-02", now: wednesday })).toEqual({ due: true, dateKey: "2026-11-04" });
  });
});

describe("weekdays", () => {
  it("describes them", () => {
    expect(describeWeekdays([...ALL_WEEKDAYS])).toBe("Every day");
    expect(describeWeekdays([5, 1, 3, 1])).toBe("Mon, Wed, Fri");
    expect(describeWeekdays([])).toBe("No days");
  });

  it("parses a clean list and refuses anything else", () => {
    expect(parseWeekdays([3, "1", 3])).toEqual([1, 3]);
    expect(parseWeekdays([7])).toBeNull();
    expect(parseWeekdays([-1])).toBeNull();
    expect(parseWeekdays([1.5])).toBeNull();
    expect(parseWeekdays("1,2")).toBeNull();
  });
});
