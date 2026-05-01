import { describe, it, expect, beforeEach } from "vitest";
import { RecordsStore, isTrackedLevel, TRACKED_LEVELS } from "../../src/systems/Records.js";

describe("Records", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("isTrackedLevel returns true only for levels 1-3", () => {
    expect(isTrackedLevel(1)).toBe(true);
    expect(isTrackedLevel(2)).toBe(true);
    expect(isTrackedLevel(3)).toBe(true);
    expect(isTrackedLevel(4)).toBe(false);
    expect(isTrackedLevel(0)).toBe(false);
  });

  it("TRACKED_LEVELS contains 1,2,3 only", () => {
    expect([...TRACKED_LEVELS].sort()).toEqual([1, 2, 3]);
  });

  it("returns 0 for any level when no records have been stored", () => {
    const store = new RecordsStore();
    expect(store.getBest(1)).toBe(0);
    expect(store.getBest(2)).toBe(0);
    expect(store.getBest(3)).toBe(0);
  });

  it("record() persists a new high score and returns true", () => {
    const store = new RecordsStore();
    expect(store.record(1, 12.7)).toBe(true);
    // Floored to whole metres.
    expect(store.getBest(1)).toBe(12);
    // Re-instantiating reads from localStorage.
    const store2 = new RecordsStore();
    expect(store2.getBest(1)).toBe(12);
  });

  it("record() rejects non-improving scores", () => {
    const store = new RecordsStore();
    store.record(2, 30);
    expect(store.record(2, 30)).toBe(false);
    expect(store.record(2, 29.9)).toBe(false);
    expect(store.getBest(2)).toBe(30);
    expect(store.record(2, 31)).toBe(true);
    expect(store.getBest(2)).toBe(31);
  });

  it("clamps negative distances to 0 (no-op against a 0 baseline)", () => {
    const store = new RecordsStore();
    expect(store.record(3, -5)).toBe(false);
    expect(store.getBest(3)).toBe(0);
  });

  it("ignores corrupted JSON in localStorage and starts from defaults", () => {
    localStorage.setItem("sock_climber_records", "{not json");
    const store = new RecordsStore();
    expect(store.getBest(1)).toBe(0);
    expect(store.record(1, 5)).toBe(true);
  });

  it("ignores non-numeric entries in stored blob", () => {
    localStorage.setItem(
      "sock_climber_records",
      JSON.stringify({ "1": "abc", "2": 7, "3": -1 }),
    );
    const store = new RecordsStore();
    expect(store.getBest(1)).toBe(0);
    expect(store.getBest(2)).toBe(7);
    expect(store.getBest(3)).toBe(0);
  });

  it("tracks records for each level independently", () => {
    const store = new RecordsStore();
    store.record(1, 5);
    store.record(2, 10);
    store.record(3, 15);
    expect(store.getBest(1)).toBe(5);
    expect(store.getBest(2)).toBe(10);
    expect(store.getBest(3)).toBe(15);
  });
});
