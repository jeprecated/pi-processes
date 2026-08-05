import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const managers: Array<{
    cleanup: ReturnType<typeof vi.fn>;
    killAll: ReturnType<typeof vi.fn>;
    shellPath: () => string | undefined;
  }> = [];
  const getManager = vi.fn(
    (opts?: { getConfiguredShellPath?: () => string | undefined }) => {
      const manager = {
        cleanup: vi.fn(),
        killAll: vi.fn(),
        shellPath: () => opts?.getConfiguredShellPath?.(),
      };
      managers.push(manager);
      return manager;
    },
  );
  return { getManager, managers };
});

vi.mock("../../src/get-manager", () => ({ getManager: mocks.getManager }));

import {
  getExtensionManagerState,
  shutdownExtensionManager,
} from "./manager-lifetime";

function fakeManager(manager: object): (typeof mocks.managers)[number] {
  return manager as (typeof mocks.managers)[number];
}

afterEach(() => {
  const state = getExtensionManagerState();
  shutdownExtensionManager(state.manager, "quit");
  mocks.getManager.mockClear();
  mocks.managers.length = 0;
});

describe("manager lifetime", () => {
  it("reuses process state across reloads and refreshes configuration", () => {
    const exitListeners = process.listenerCount("exit");
    const first = getExtensionManagerState({
      getConfiguredShellPath: () => "/old/bash",
    });
    const second = getExtensionManagerState({
      getConfiguredShellPath: () => "/new/bash",
    });
    const manager = fakeManager(first.manager);

    expect(second).toBe(first);
    expect(mocks.getManager).toHaveBeenCalledTimes(1);
    expect(manager.shellPath()).toBe("/new/bash");
    expect(process.listenerCount("exit")).toBe(exitListeners + 1);

    shutdownExtensionManager(first.manager, "reload");

    expect(manager.killAll).not.toHaveBeenCalled();
    expect(manager.cleanup).not.toHaveBeenCalled();
    expect(process.listenerCount("exit")).toBe(exitListeners + 1);

    shutdownExtensionManager(first.manager, "quit");

    expect(manager.killAll).toHaveBeenCalledTimes(1);
    expect(manager.cleanup).toHaveBeenCalledTimes(1);
    expect(process.listenerCount("exit")).toBe(exitListeners);
  });

  it("keeps notification watches across reloads", () => {
    const first = getExtensionManagerState();
    first.notifications.register("process-1", {
      logMatches: [{ pattern: "ready" }],
    });

    shutdownExtensionManager(first.manager, "reload");
    const second = getExtensionManagerState();

    expect(second.notifications).toBe(first.notifications);
    expect(second.notifications.get("process-1")?.logMatches).toEqual([
      { pattern: "ready" },
    ]);

    shutdownExtensionManager(second.manager, "quit");
    expect(second.notifications.get("process-1")).toBeNull();
  });

  it.each([
    "quit",
    "new",
    "resume",
    "fork",
  ] as const)("cleans up process state on %s", (reason) => {
    const first = getExtensionManagerState();
    const manager = fakeManager(first.manager);

    shutdownExtensionManager(first.manager, reason);
    const second = getExtensionManagerState();

    expect(manager.killAll).toHaveBeenCalledTimes(1);
    expect(manager.cleanup).toHaveBeenCalledTimes(1);
    expect(second.manager).not.toBe(first.manager);
  });
});
