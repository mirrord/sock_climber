import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../../src/core/EventBus.js";

type TestEvents = {
  ping: { id: number };
  pong: { msg: string };
};

describe("EventBus", () => {
  it("subscribers receive the emitted payload", () => {
    const bus = createEventBus<TestEvents>();
    const received: Array<{ id: number }> = [];
    bus.on("ping", (p) => received.push(p));
    bus.emit("ping", { id: 1 });
    expect(received).toEqual([{ id: 1 }]);
  });

  it("multiple subscribers receive in registration order", () => {
    const bus = createEventBus<TestEvents>();
    const order: number[] = [];
    bus.on("ping", () => order.push(1));
    bus.on("ping", () => order.push(2));
    bus.on("ping", () => order.push(3));
    bus.emit("ping", { id: 0 });
    expect(order).toEqual([1, 2, 3]);
  });

  it("on() returns an unsubscribe function that works", () => {
    const bus = createEventBus<TestEvents>();
    let count = 0;
    const unsub = bus.on("ping", () => count++);
    bus.emit("ping", { id: 1 });
    unsub();
    bus.emit("ping", { id: 2 });
    expect(count).toBe(1);
  });

  it("off() removes the specific handler", () => {
    const bus = createEventBus<TestEvents>();
    let countA = 0;
    let countB = 0;
    const hA = () => countA++;
    const hB = () => countB++;
    bus.on("ping", hA);
    bus.on("ping", hB);
    bus.off("ping", hA);
    bus.emit("ping", { id: 0 });
    expect(countA).toBe(0);
    expect(countB).toBe(1);
  });

  it("unsubscribe mid-emit does not call the handler in the same emit", () => {
    const bus = createEventBus<TestEvents>();
    let count = 0;
    let unsub: (() => void) | null = null;
    unsub = bus.on("ping", () => {
      count++;
      unsub?.();
    });
    bus.emit("ping", { id: 1 });
    bus.emit("ping", { id: 2 });
    expect(count).toBe(1);
  });

  it("handlers added during emit are not called in that emit", () => {
    const bus = createEventBus<TestEvents>();
    let count = 0;
    bus.on("ping", () => {
      // Add another subscriber during emit.
      bus.on("ping", () => count++);
    });
    bus.emit("ping", { id: 1 });
    expect(count).toBe(0); // Not called this emit.
    bus.emit("ping", { id: 2 });
    expect(count).toBe(1); // Called on the next emit.
  });

  it("off() on a non-existent event/handler does not throw", () => {
    const bus = createEventBus<TestEvents>();
    expect(() => bus.off("ping", () => {})).not.toThrow();
  });

  it("clear() removes all subscriptions", () => {
    const bus = createEventBus<TestEvents>();
    let count = 0;
    bus.on("ping", () => count++);
    bus.on("pong", () => count++);
    bus.clear();
    bus.emit("ping", { id: 0 });
    bus.emit("pong", { msg: "hi" });
    expect(count).toBe(0);
  });
});
