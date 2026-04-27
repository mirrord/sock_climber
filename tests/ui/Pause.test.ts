import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEventBus } from "../../src/core/EventBus.js";
import type { GameEvents } from "../../src/core/EventBus.js";
import { Pause } from "../../src/ui/Pause.js";

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("Pause", () => {
  let bus: ReturnType<typeof createEventBus<GameEvents>>;
  let container: HTMLElement;

  beforeEach(() => {
    bus = createEventBus<GameEvents>();
    container = makeContainer();
  });

  it("overlay starts hidden", () => {
    const pause = new Pause(bus, vi.fn(), vi.fn(), container);
    expect(container.querySelector("#pause")?.classList.contains("hidden")).toBe(true);
    pause.destroy();
  });

  it("onPause shows the overlay", () => {
    const pause = new Pause(bus, vi.fn(), vi.fn(), container);
    bus.emit("onPause", {});
    expect(container.querySelector("#pause")?.classList.contains("hidden")).toBe(false);
    pause.destroy();
  });

  it("onResume hides the overlay", () => {
    const pause = new Pause(bus, vi.fn(), vi.fn(), container);
    bus.emit("onPause", {});
    bus.emit("onResume", {});
    expect(container.querySelector("#pause")?.classList.contains("hidden")).toBe(true);
    pause.destroy();
  });

  it("clicking Resume emits onResume and hides the overlay", () => {
    const resumeHandler = vi.fn();
    bus.on("onResume", resumeHandler);
    const pause = new Pause(bus, vi.fn(), vi.fn(), container);
    bus.emit("onPause", {});

    container.querySelector<HTMLButtonElement>("#pause-resume")?.click();

    expect(resumeHandler).toHaveBeenCalledOnce();
    expect(container.querySelector("#pause")?.classList.contains("hidden")).toBe(true);
    pause.destroy();
  });

  it("clicking Settings calls the openSettings callback", () => {
    const openSettings = vi.fn();
    const pause = new Pause(bus, vi.fn(), openSettings, container);
    bus.emit("onPause", {});

    container.querySelector<HTMLButtonElement>("#pause-settings")?.click();
    expect(openSettings).toHaveBeenCalledOnce();
    pause.destroy();
  });

  it("clicking Quit calls onQuit without emitting onResume", () => {
    const onQuit = vi.fn();
    const resumeHandler = vi.fn();
    bus.on("onResume", resumeHandler);
    const pause = new Pause(bus, onQuit, vi.fn(), container);
    bus.emit("onPause", {});

    container.querySelector<HTMLButtonElement>("#pause-quit")?.click();
    expect(onQuit).toHaveBeenCalledOnce();
    expect(resumeHandler).not.toHaveBeenCalled();
    pause.destroy();
  });
});
