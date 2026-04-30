import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import { ScoreSystem } from "../../src/systems/ScoreSystem.js";
import { Victory } from "../../src/ui/Victory.js";

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("Victory", () => {
  let bus: ReturnType<typeof createEventBus<GameEvents>>;
  let scoreSystem: ScoreSystem;
  let container: HTMLElement;

  beforeEach(() => {
    bus = createEventBus<GameEvents>();
    scoreSystem = new ScoreSystem(bus);
    container = makeContainer();
  });

  it("overlay starts hidden", () => {
    const v = new Victory(bus, scoreSystem, vi.fn(), vi.fn(), container);
    expect(container.querySelector("#victory")?.classList.contains("hidden")).toBe(true);
    v.destroy();
  });

  it("onLevelComplete shows the overlay", () => {
    const v = new Victory(bus, scoreSystem, vi.fn(), vi.fn(), container);
    bus.emit("onLevelComplete", { levelId: 4 });
    expect(container.querySelector("#victory")?.classList.contains("hidden")).toBe(false);
    v.destroy();
  });

  it("displays kill count from scoreSystem on victory", () => {
    const v = new Victory(bus, scoreSystem, vi.fn(), vi.fn(), container);
    bus.emit("onKill", { entityId: 1 });
    bus.emit("onKill", { entityId: 2 });
    bus.emit("onKill", { entityId: 3 });
    bus.emit("onLevelComplete", { levelId: 4 });

    const killsEl = container.querySelector("#vt-kills");
    expect(killsEl?.textContent).toContain("3");
    v.destroy();
  });

  it("clicking Play Again calls onRestart and hides the overlay", () => {
    const onRestart = vi.fn();
    const v = new Victory(bus, scoreSystem, onRestart, vi.fn(), container);
    bus.emit("onLevelComplete", { levelId: 4 });

    container.querySelector<HTMLButtonElement>("#vt-restart")?.click();

    expect(onRestart).toHaveBeenCalledOnce();
    expect(container.querySelector("#victory")?.classList.contains("hidden")).toBe(true);
    v.destroy();
  });

  it("clicking Title calls onTitle and hides the overlay", () => {
    const onTitle = vi.fn();
    const v = new Victory(bus, scoreSystem, vi.fn(), onTitle, container);
    bus.emit("onLevelComplete", { levelId: 4 });

    container.querySelector<HTMLButtonElement>("#vt-title")?.click();

    expect(onTitle).toHaveBeenCalledOnce();
    expect(container.querySelector("#victory")?.classList.contains("hidden")).toBe(true);
    v.destroy();
  });

  it("destroy() removes the overlay and stops responding to events", () => {
    const v = new Victory(bus, scoreSystem, vi.fn(), vi.fn(), container);
    v.destroy();
    expect(container.querySelector("#victory")).toBeNull();
    // Re-emitting after destroy must not re-create or throw.
    expect(() => bus.emit("onLevelComplete", { levelId: 4 })).not.toThrow();
    expect(container.querySelector("#victory")).toBeNull();
  });
});
