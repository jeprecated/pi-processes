import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import { createNotificationRegistry } from "../notifications/registry";
import { registerCleanupHook } from "./cleanup";

type ShutdownReason = "quit" | "reload" | "new" | "resume" | "fork";
type Shutdown = (event: { reason: ShutdownReason }) => Promise<void> | void;

function setup() {
  let shutdown: Shutdown = () => {
    throw new Error("shutdown handler was not registered");
  };
  const calls: string[] = [];
  const pi = {
    on: vi.fn((event: string, handler: Shutdown) => {
      if (event === "session_shutdown") shutdown = handler;
    }),
  } as unknown as ExtensionAPI;
  const manager = {
    killAll: vi.fn(() => calls.push("killAll")),
    cleanup: vi.fn(() => calls.push("cleanup")),
  };
  const notificationService = {
    dispose: vi.fn(() => calls.push("notificationService.dispose")),
  };
  const notifications = createNotificationRegistry();
  const clearNotifications = vi.spyOn(notifications, "clear");
  const disposer = vi.fn(() => calls.push("disposer"));

  registerCleanupHook(pi, {
    manager: manager as never,
    notifications,
    notificationService,
    disposers: [disposer],
  });

  return {
    calls,
    clearNotifications,
    disposer,
    manager,
    notificationService,
    shutdown: (reason: ShutdownReason) => shutdown({ reason }),
  };
}

describe("registerCleanupHook", () => {
  it("runs disposers before manager cleanup and ignores duplicate shutdown", async () => {
    const state = setup();

    await state.shutdown("quit");
    await state.shutdown("quit");

    expect(state.disposer).toHaveBeenCalledTimes(1);
    expect(state.notificationService.dispose).toHaveBeenCalledWith({
      preserveMatcherState: false,
    });
    expect(state.clearNotifications).toHaveBeenCalledTimes(1);
    expect(state.manager.killAll).toHaveBeenCalledTimes(1);
    expect(state.manager.cleanup).toHaveBeenCalledTimes(1);
    expect(state.calls).toEqual([
      "disposer",
      "notificationService.dispose",
      "killAll",
      "cleanup",
    ]);
  });

  it("tears down extension listeners without clearing process state on reload", async () => {
    const state = setup();

    await state.shutdown("reload");

    expect(state.disposer).toHaveBeenCalledTimes(1);
    expect(state.notificationService.dispose).toHaveBeenCalledWith({
      preserveMatcherState: true,
    });
    expect(state.clearNotifications).not.toHaveBeenCalled();
    expect(state.manager.killAll).not.toHaveBeenCalled();
    expect(state.manager.cleanup).not.toHaveBeenCalled();
    expect(state.calls).toEqual(["disposer", "notificationService.dispose"]);
  });
});
