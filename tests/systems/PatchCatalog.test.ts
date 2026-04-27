import { describe, it, expect } from "vitest";
import { PATCH_CATALOG } from "../../src/systems/PatchCatalog.js";
import type { PatchEntry } from "../../src/systems/PatchCatalog.js";
import { Player } from "../../src/entities/Player.js";

function getEntry(id: string): PatchEntry {
  const entry = PATCH_CATALOG.find((p) => p.id === id);
  if (!entry) throw new Error(`Patch not found: ${id}`);
  return entry;
}

// ─── Catalog structure ────────────────────────────────────────────────────

describe("PatchCatalog — structure", () => {
  it("contains exactly 7 patches", () => {
    expect(PATCH_CATALOG.length).toBe(7);
  });

  it("each patch has a unique id", () => {
    const ids = PATCH_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each patch has a name and description", () => {
    for (const patch of PATCH_CATALOG) {
      expect(patch.name.length).toBeGreaterThan(0);
      expect(patch.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── AirJump cap ──────────────────────────────────────────────────────────

describe("PatchCatalog — AirJump eligibility", () => {
  it("eligible when maxAirJumps + maxAirDashes < 2", () => {
    const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 0, maxAirDashes: 0 });
    expect(getEntry("AirJump").isEligible(player, new Set())).toBe(true);
  });

  it("ineligible when maxAirJumps + maxAirDashes >= 2", () => {
    const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 1, maxAirDashes: 1 });
    expect(getEntry("AirJump").isEligible(player, new Set())).toBe(false);
  });

  it("ineligible when base maxAirJumps alone is >= 2", () => {
    const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 2, maxAirDashes: 0 });
    expect(getEntry("AirJump").isEligible(player, new Set())).toBe(false);
  });
});

// ─── AirDash cap ─────────────────────────────────────────────────────────

describe("PatchCatalog — AirDash eligibility", () => {
  it("eligible when maxAirJumps + maxAirDashes < 2", () => {
    const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 0, maxAirDashes: 0 });
    expect(getEntry("AirDash").isEligible(player, new Set())).toBe(true);
  });

  it("ineligible when maxAirJumps + maxAirDashes >= 2", () => {
    const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 2, maxAirDashes: 0 });
    expect(getEntry("AirDash").isEligible(player, new Set())).toBe(false);
  });

  it("ineligible when combined is exactly 2 with one of each", () => {
    const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 1, maxAirDashes: 1 });
    expect(getEntry("AirDash").isEligible(player, new Set())).toBe(false);
  });
});

// ─── ExtraHP cap ──────────────────────────────────────────────────────────

describe("PatchCatalog — ExtraHP eligibility", () => {
  it("eligible when not yet applied", () => {
    const player = new Player({ x: 0, y: 0 });
    expect(getEntry("ExtraHP").isEligible(player, new Set())).toBe(true);
  });

  it("ineligible when already applied once", () => {
    const player = new Player({ x: 0, y: 0 });
    expect(getEntry("ExtraHP").isEligible(player, new Set(["ExtraHP"]))).toBe(false);
  });
});

// ─── Always-eligible patches ──────────────────────────────────────────────

describe("PatchCatalog — always-eligible patches", () => {
  const alwaysEligible = ["Speed", "Damage", "AttackSpeed", "SlowFlood"];

  for (const id of alwaysEligible) {
    it(`${id} is always eligible regardless of player state`, () => {
      const player = new Player({ x: 0, y: 0 }, { maxAirJumps: 2, maxAirDashes: 2 });
      expect(getEntry(id).isEligible(player, new Set([id, id]))).toBe(true);
    });
  }
});

// ─── statMod values ───────────────────────────────────────────────────────

describe("PatchCatalog — statMod values", () => {
  it("AirJump adds 1 to maxAirJumps", () => {
    expect(getEntry("AirJump").statMod.maxAirJumps).toBe(1);
  });

  it("AirDash adds 1 to maxAirDashes", () => {
    expect(getEntry("AirDash").statMod.maxAirDashes).toBe(1);
  });

  it("Speed increases maxSpeed", () => {
    expect((getEntry("Speed").statMod.maxSpeed ?? 0)).toBeGreaterThan(0);
  });

  it("Damage increases damageMultiplier", () => {
    expect((getEntry("Damage").statMod.damageMultiplier ?? 0)).toBeGreaterThan(0);
  });

  it("AttackSpeed increases attackSpeedMultiplier", () => {
    expect((getEntry("AttackSpeed").statMod.attackSpeedMultiplier ?? 0)).toBeGreaterThan(0);
  });

  it("SlowFlood decreases deathPlaneSpeedMultiplier", () => {
    expect((getEntry("SlowFlood").statMod.deathPlaneSpeedMultiplier ?? 0)).toBeLessThan(0);
  });

  it("ExtraHP has an empty statMod (uses gainContainer instead)", () => {
    const mod = getEntry("ExtraHP").statMod;
    expect(Object.keys(mod).length).toBe(0);
  });
});
