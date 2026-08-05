import { assert, expect } from "vitest";
import {
  getExtensionManagerState,
  shutdownExtensionManager,
} from "../../extensions/processes/manager-lifetime";
import { test } from "./fixtures";
import { waitForEnd } from "./utils";

test("keeps a real process and its output across reload", async ({ cwd }) => {
  const first = getExtensionManagerState();

  try {
    const info = first.manager.start(
      "reload-survivor",
      "sleep 0.2; echo survived",
      cwd,
    );
    first.notifications.register(info.id, {
      logMatches: [{ pattern: "survived" }],
    });

    shutdownExtensionManager(first.manager, "reload");
    const second = getExtensionManagerState();

    expect(second).toBe(first);
    expect(second.manager.get(info.id)?.status).toBe("running");
    expect(second.notifications.get(info.id)?.logMatches).toEqual([
      { pattern: "survived" },
    ]);

    const ended = await waitForEnd(second.manager, info.id);
    expect(ended.success).toBe(true);

    const output = second.manager.getOutput(info.id);
    assert(output, "output should exist");
    expect(output.stdout).toContain("survived");
  } finally {
    shutdownExtensionManager(first.manager, "quit");
  }
});
