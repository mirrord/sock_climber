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

  it("renders both empty and full bar sprite images", () => {
    const hud = new HUD(bus, container);

    const empty = container.querySelector<HTMLImageElement>(".gauge-empty");
    const full = container.querySelector<HTMLImageElement>(".gauge-fill .gauge-full");
    expect(empty).not.toBeNull();
    expect(full).not.toBeNull();
    expect(empty!.getAttribute("src")).toBe("assets/sprites/bar empty.png");
    expect(full!.getAttribute("src")).toBe("assets/sprites/bar full.png");

    hud.destroy();
  });

  it("adds the is-full class to #hud-gauge on onGaugeFull and removes it on next reset", () => {
    const hud = new HUD(bus, container);
    const gauge = container.querySelector<HTMLElement>("#hud-gauge")!;

    bus.emit("onGaugeFull", {});
    expect(gauge.classList.contains("is-full")).toBe(true);

    bus.emit("onGaugeChanged", { fill: 0 });
    expect(gauge.classList.contains("is-full")).toBe(false);

    hud.destroy();
  });

  it("renders trailing particle dots inside the gauge while bar is full", () => {
    const hud = new HUD(bus, container);
    // No dots before bar is full.
    expect(container.querySelectorAll(".gauge-trail-dot").length).toBe(0);

    bus.emit("onGaugeFull", {});
    // First dot is emitted immediately on entering the full state.
    expect(container.querySelectorAll(".gauge-trail-dot").length).toBeGreaterThan(0);

    // After the bar is no longer full, the trail container is cleared.
    bus.emit("onGaugeChanged", { fill: 0 });
    expect(container.querySelectorAll(".gauge-trail-dot").length).toBe(0);

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
