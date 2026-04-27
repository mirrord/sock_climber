import { describe, it, expect, beforeEach } from "vitest";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import { HUD } from "../../src/ui/HUD.js";

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("HUD", () => {
  let bus: ReturnType<typeof createEventBus<GameEvents>>;
  let container: HTMLElement;

  beforeEach(() => {
    bus = createEventBus<GameEvents>();
    container = makeContainer();
  });

  it("renders the correct number of filled and empty HP containers on onHpChanged", () => {
    const hud = new HUD(bus, container);
    bus.emit("onHpChanged", { current: 2, max: 4, empty: 2 });

    const filled = container.querySelectorAll(".hp-container.filled");
    const empty = container.querySelectorAll(".hp-container.empty");
    expect(filled.length).toBe(2);
    expect(empty.length).toBe(2);

    hud.destroy();
  });

  it("updates gauge fill width on onGaugeChanged", () => {
    const hud = new HUD(bus, container);
    bus.emit("onGaugeChanged", { fill: 0.5 });

    const fill = container.querySelector<HTMLElement>(".gauge-fill");
    expect(fill?.style.width).toBe("50%");

    hud.destroy();
  });

  it("adds a buff element on onBuffApplied", () => {
    const hud = new HUD(bus, container);
    bus.emit("onBuffApplied", { buffId: "SpeedSock", duration: 5 });

    const buff = container.querySelector("[data-id='SpeedSock']");
    expect(buff).not.toBeNull();

    hud.destroy();
  });

  it("removes the buff element on onBuffExpired", () => {
    const hud = new HUD(bus, container);
    bus.emit("onBuffApplied", { buffId: "SpeedSock", duration: 5 });
    bus.emit("onBuffExpired", { buffId: "SpeedSock" });

    const buff = container.querySelector("[data-id='SpeedSock']");
    expect(buff).toBeNull();

    hud.destroy();
  });

  it("updates distance text on onDistanceChanged", () => {
    const hud = new HUD(bus, container);
    bus.emit("onDistanceChanged", { distance: 42 });

    const distEl = container.querySelector("#hud-distance");
    expect(distEl?.textContent).toBe("42 m");

    hud.destroy();
  });

  it("stops updating after destroy()", () => {
    const hud = new HUD(bus, container);
    hud.destroy();
    bus.emit("onDistanceChanged", { distance: 99 });

    const distEl = container.querySelector("#hud-distance");
    expect(distEl?.textContent).not.toBe("99 m");
  });
});
