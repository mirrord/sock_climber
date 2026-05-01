import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import { createRNG } from "../../src/core/RNG.js";
import { Player } from "../../src/entities/Player.js";
import { UpgradeSystem } from "../../src/systems/UpgradeSystem.js";
import { PatchPicker } from "../../src/ui/PatchPicker.js";

function makePlayer(): Player {
  const p = new Player({ x: 0, y: 0 }, { maxHealth: 3 });
  // Damage once so emptyContainers = 1.
  p.takeDamage(1, 0, 0);
  (p as unknown as { _health: { iFrameTimer: number } })._health.iFrameTimer = 0;
  return p;
}

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("PatchPicker", () => {
  let bus: ReturnType<typeof createEventBus<GameEvents>>;
  let upgradeSystem: UpgradeSystem;
  let player: Player;
  let container: HTMLElement;

  beforeEach(() => {
    bus = createEventBus<GameEvents>();
    upgradeSystem = new UpgradeSystem(bus, createRNG(42));
    player = makePlayer();
    container = makeContainer();
  });

  function openPicker(): void {
    // 4 kills fills the gauge.
    for (let i = 0; i < 4; i++) bus.emit("onKill", { entityId: i });
    // Player must explicitly invoke the picker (mirrors ApplyPatch input).
    upgradeSystem.tryOpenPicker(player);
    // tryOpenPicker emits onPickerOpen, which PatchPicker listens for.
  }

  it("modal starts hidden", () => {
    const pp = new PatchPicker(bus, upgradeSystem, player, container);
    const modal = container.querySelector("#patch-picker");
    expect(modal?.classList.contains("hidden")).toBe(true);
    pp.destroy();
  });

  it("modal is shown on onPickerOpen", () => {
    const pp = new PatchPicker(bus, upgradeSystem, player, container);
    openPicker();

    const modal = container.querySelector("#patch-picker");
    expect(modal?.classList.contains("hidden")).toBe(false);
    pp.destroy();
  });

  it("modal displays exactly 3 patch buttons with distinct names", () => {
    const pp = new PatchPicker(bus, upgradeSystem, player, container);
    openPicker();

    const buttons = container.querySelectorAll<HTMLButtonElement>(".patch-btn");
    expect(buttons.length).toBe(3);

    const names = Array.from(buttons).map((b) => b.dataset.patchId);
    const unique = new Set(names);
    expect(unique.size).toBe(3);
    pp.destroy();
  });

  it("clicking a button calls selectPatch and hides the modal", () => {
    const pp = new PatchPicker(bus, upgradeSystem, player, container);
    openPicker();

    const spy = vi.spyOn(upgradeSystem, "selectPatch");
    const btn = container.querySelector<HTMLButtonElement>(".patch-btn");
    btn?.click();

    expect(spy).toHaveBeenCalledOnce();
    const modal = container.querySelector("#patch-picker");
    expect(modal?.classList.contains("hidden")).toBe(true);
    pp.destroy();
  });

  it("emits onPickerOpen when picker opens and onPickerClose when a choice is made; does NOT emit onPause/onResume", () => {
    const pp = new PatchPicker(bus, upgradeSystem, player, container);
    const openHandler = vi.fn();
    const closeHandler = vi.fn();
    const pauseHandler = vi.fn();
    const resumeHandler = vi.fn();
    bus.on("onPickerOpen", openHandler);
    bus.on("onPickerClose", closeHandler);
    bus.on("onPause", pauseHandler);
    bus.on("onResume", resumeHandler);

    openPicker();
    expect(openHandler).toHaveBeenCalledOnce();
    expect(pauseHandler).not.toHaveBeenCalled();

    const btn = container.querySelector<HTMLButtonElement>(".patch-btn");
    btn?.click();
    expect(closeHandler).toHaveBeenCalledOnce();
    expect(resumeHandler).not.toHaveBeenCalled();

    pp.destroy();
  });
});

describe("PatchPicker — loadout mode", () => {
  let bus: ReturnType<typeof createEventBus<GameEvents>>;
  let upgradeSystem: UpgradeSystem;
  let player: Player;
  let container: HTMLElement;

  beforeEach(() => {
    bus = createEventBus<GameEvents>();
    upgradeSystem = new UpgradeSystem(bus, createRNG(42));
    player = makePlayer();
    container = makeContainer();
  });

  it("setLoadoutMode hides the Skip button and shows remaining-count text in the heading", () => {
    const pp = new PatchPicker(bus, upgradeSystem, player, container);
    pp.setLoadoutMode(3);
    upgradeSystem.openLoadoutOffer(player);

    const heading = container.querySelector("#patch-picker h2");
    expect(heading?.textContent).toMatch(/Choose Your Loadout/);
    expect(heading?.textContent).toMatch(/3/);

    const skip = container.querySelector<HTMLButtonElement>(".patch-skip-btn");
    expect(skip?.classList.contains("hidden")).toBe(true);
    pp.destroy();
  });

  it("setLoadoutMode(null) restores the default heading and shows the Skip button", () => {
    const pp = new PatchPicker(bus, upgradeSystem, player, container);
    pp.setLoadoutMode(2);
    pp.setLoadoutMode(null);
    bus.emit("onPickerOpen", {});

    const skip = container.querySelector<HTMLButtonElement>(".patch-skip-btn");
    expect(skip?.classList.contains("hidden")).toBe(false);
    pp.destroy();
  });
});
