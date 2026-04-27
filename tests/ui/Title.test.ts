import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import { Title } from "../../src/ui/Title.js";

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("Title", () => {
  let bus: ReturnType<typeof createEventBus<GameEvents>>;
  let container: HTMLElement;

  beforeEach(() => {
    bus = createEventBus<GameEvents>();
    container = makeContainer();
  });

  it("title screen is visible on construction", () => {
    const title = new Title(bus, vi.fn(), container);
    const overlay = container.querySelector("#title");
    expect(overlay?.classList.contains("hidden")).toBe(false);
    title.destroy();
  });

  it("clicking Start emits onGameStart and hides the overlay", () => {
    const gameStartHandler = vi.fn();
    bus.on("onGameStart", gameStartHandler);
    const title = new Title(bus, vi.fn(), container);

    container.querySelector<HTMLButtonElement>("#title-start")?.click();

    expect(gameStartHandler).toHaveBeenCalledOnce();
    expect(container.querySelector("#title")?.classList.contains("hidden")).toBe(true);
    title.destroy();
  });

  it("onGameStart is not fired again without another click", () => {
    const gameStartHandler = vi.fn();
    bus.on("onGameStart", gameStartHandler);
    const title = new Title(bus, vi.fn(), container);

    container.querySelector<HTMLButtonElement>("#title-start")?.click();
    // Additional direct bus emissions don't count as user clicks.
    expect(gameStartHandler).toHaveBeenCalledOnce();
    title.destroy();
  });

  it("clicking Settings calls the openSettings callback", () => {
    const openSettings = vi.fn();
    const title = new Title(bus, openSettings, container);

    container.querySelector<HTMLButtonElement>("#title-settings")?.click();
    expect(openSettings).toHaveBeenCalledOnce();
    title.destroy();
  });
});
