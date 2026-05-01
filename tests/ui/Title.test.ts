import { describe, it, expect, beforeEach, vi } from "vitest";
import { Title } from "../../src/ui/Title.js";

function makeContainer(): HTMLElement {
  const div = document.createElement("div");
  document.body.appendChild(div);
  return div;
}

describe("Title", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = makeContainer();
  });

  it("title screen is visible on construction", () => {
    const title = new Title(vi.fn(), vi.fn(), vi.fn(), container);
    const overlay = container.querySelector("#title");
    expect(overlay?.classList.contains("hidden")).toBe(false);
    title.destroy();
  });

  it("clicking Start invokes the onStart callback and hides the overlay", () => {
    const onStart = vi.fn();
    const title = new Title(onStart, vi.fn(), vi.fn(), container);

    container.querySelector<HTMLButtonElement>("#title-start")?.click();

    expect(onStart).toHaveBeenCalledOnce();
    expect(container.querySelector("#title")?.classList.contains("hidden")).toBe(true);
    title.destroy();
  });

  it("onStart is not fired again without another click", () => {
    const onStart = vi.fn();
    const title = new Title(onStart, vi.fn(), vi.fn(), container);

    container.querySelector<HTMLButtonElement>("#title-start")?.click();
    expect(onStart).toHaveBeenCalledOnce();
    title.destroy();
  });

  it("clicking Settings calls the openSettings callback", () => {
    const openSettings = vi.fn();
    const title = new Title(vi.fn(), openSettings, vi.fn(), container);

    container.querySelector<HTMLButtonElement>("#title-settings")?.click();
    expect(openSettings).toHaveBeenCalledOnce();
    title.destroy();
  });

  it("clicking Credits calls the openCredits callback", () => {
    const openCredits = vi.fn();
    const title = new Title(vi.fn(), vi.fn(), openCredits, container);

    container.querySelector<HTMLButtonElement>("#title-credits")?.click();
    expect(openCredits).toHaveBeenCalledOnce();
    title.destroy();
  });
});
