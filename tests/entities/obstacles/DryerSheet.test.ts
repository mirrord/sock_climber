import { describe, it, expect, beforeEach } from "vitest";
import { DryerSheet } from "../../../src/entities/obstacles/DryerSheet.js";
import { _resetEntityIds } from "../../../src/entities/Entity.js";

const DT = 1 / 120;

beforeEach(() => {
  _resetEntityIds();
});

describe("DryerSheet — projectile", () => {
  it("starts unexpired", () => {
    const sheet = new DryerSheet({ x: 0, y: 0 }, 1);
    expect(sheet.expired).toBe(false);
  });

  it("integrates position along the configured direction", () => {
    const sheet = new DryerSheet({ x: 0, y: 0 }, 1);
    const x0 = sheet.body.position.x;
    sheet.update(DT);
    expect(sheet.body.position.x).toBeGreaterThan(x0);
    expect(sheet.body.position.y).toBe(0);
  });

  it("travels left when direction is -1", () => {
    const sheet = new DryerSheet({ x: 0, y: 0 }, -1);
    sheet.update(DT);
    expect(sheet.body.position.x).toBeLessThan(0);
  });

  it("expires after LIFETIME seconds", () => {
    const sheet = new DryerSheet({ x: 0, y: 0 }, 1);
    const steps = Math.ceil(DryerSheet.LIFETIME / DT) + 1;
    for (let i = 0; i < steps; i++) sheet.update(DT);
    expect(sheet.expired).toBe(true);
  });

  it("consume() flags as expired immediately", () => {
    const sheet = new DryerSheet({ x: 0, y: 0 }, 1);
    sheet.consume();
    expect(sheet.expired).toBe(true);
  });

  it("does not move once expired", () => {
    const sheet = new DryerSheet({ x: 0, y: 0 }, 1);
    sheet.consume();
    const x0 = sheet.body.position.x;
    sheet.update(DT);
    expect(sheet.body.position.x).toBe(x0);
  });
});
