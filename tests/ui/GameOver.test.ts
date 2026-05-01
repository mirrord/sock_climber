import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import { ScoreSystem } from "../../src/systems/ScoreSystem.js";
import { GameOver } from "../../src/ui/GameOver.js";

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("GameOver", () => {
  let bus: ReturnType<typeof createEventBus<GameEvents>>;
  let scoreSystem: ScoreSystem;
  let container: HTMLElement;

  beforeEach(() => {
    bus = createEventBus<GameEvents>();
    scoreSystem = new ScoreSystem(bus);
    container = makeContainer();
  });

  it("overlay starts hidden", () => {
    const go = new GameOver(bus, scoreSystem, vi.fn(), vi.fn(), container);
    expect(container.querySelector("#game-over")?.classList.contains("hidden")).toBe(true);
    go.destroy();
  });

  it("onPlayerDeath shows the overlay", () => {
    const go = new GameOver(bus, scoreSystem, vi.fn(), vi.fn(), container);
    bus.emit("onPlayerDeath", { reason: "drowned" });
    expect(container.querySelector("#game-over")?.classList.contains("hidden")).toBe(false);
    go.destroy();
  });

  it("displays distance from scoreSystem on death", () => {
    const go = new GameOver(bus, scoreSystem, vi.fn(), vi.fn(), container);
    scoreSystem.update(-50);
    bus.emit("onPlayerDeath", { reason: "drowned" });

    const distEl = container.querySelector("#go-distance");
    expect(distEl?.textContent).toContain("50");
    go.destroy();
  });

  it("displays kill count from scoreSystem on death", () => {
    const go = new GameOver(bus, scoreSystem, vi.fn(), vi.fn(), container);
    bus.emit("onKill", { entityId: 1 });
    bus.emit("onKill", { entityId: 2 });
    bus.emit("onPlayerDeath", { reason: "drowned" });

    const killsEl = container.querySelector("#go-kills");
    expect(killsEl?.textContent).toContain("2");
    go.destroy();
  });

  it("clicking Play Again calls the onRestart callback", () => {
    const onRestart = vi.fn();
    const go = new GameOver(bus, scoreSystem, onRestart, vi.fn(), container);
    bus.emit("onPlayerDeath", { reason: "drowned" });

    container.querySelector<HTMLButtonElement>("#go-restart")?.click();
    expect(onRestart).toHaveBeenCalledOnce();
    go.destroy();
  });

  it("clicking Exit to Main Menu calls the onTitle callback", () => {
    const onTitle = vi.fn();
    const go = new GameOver(bus, scoreSystem, vi.fn(), onTitle, container);
    bus.emit("onPlayerDeath", { reason: "drowned" });

    container.querySelector<HTMLButtonElement>("#go-title")?.click();
    expect(onTitle).toHaveBeenCalledOnce();
    go.destroy();
  });
});
