import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { ProcessManager } from "../../../src/manager";
import { shutdownExtensionManager } from "../manager-lifetime";
import type { NotificationRegistry } from "../notifications/registry";

interface NotificationService {
  dispose(options?: { preserveMatcherState?: boolean }): void;
}

type Disposer = () => void;

interface CleanupHookDeps {
  manager: ProcessManager;
  notifications: NotificationRegistry;
  notificationService: NotificationService;
  disposers?: Disposer[];
  disposeOverlays?: () => void;
}

export function registerCleanupHook(
  pi: ExtensionAPI,
  deps: CleanupHookDeps,
): void {
  let shuttingDown = false;

  pi.on("session_shutdown", async (event) => {
    if (shuttingDown) return;
    shuttingDown = true;

    // Close any open overview panels first so they stop listening to events
    // before the manager and protocol handlers are torn down.
    deps.disposeOverlays?.();

    for (const dispose of deps.disposers ?? []) {
      dispose();
    }

    deps.notificationService.dispose({
      preserveMatcherState: event.reason === "reload",
    });
    if (event.reason !== "reload") deps.notifications.clear();
    shutdownExtensionManager(deps.manager, event.reason);
  });
}
