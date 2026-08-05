import type { SessionShutdownEvent } from "@earendil-works/pi-coding-agent";

import { getManager, type ManagerOptions } from "../../src/get-manager";
import type { ProcessManager } from "../../src/manager";
import {
  createNotificationRegistry,
  type NotificationRegistry,
} from "./notifications/registry";
import {
  createNotificationServiceState,
  type NotificationServiceState,
} from "./notifications/service";

const MANAGER_KEY = Symbol.for("@aliou/pi-processes/core-manager");

export type ShutdownReason = SessionShutdownEvent["reason"];

export interface ExtensionManagerState {
  manager: ProcessManager;
  notifications: NotificationRegistry;
  notificationServiceState: NotificationServiceState;
}

interface ManagerLifetime extends ExtensionManagerState {
  getConfiguredShellPath: ManagerOptions["getConfiguredShellPath"];
  cleanupOnExit: () => void;
}

function getLifetime(): ManagerLifetime | undefined {
  return Reflect.get(globalThis, MANAGER_KEY) as ManagerLifetime | undefined;
}

function clearLifetime(lifetime: ManagerLifetime): void {
  if (getLifetime() === lifetime)
    Reflect.deleteProperty(globalThis, MANAGER_KEY);
}

/** Keep process state alive while Pi replaces extension instances. */
export function getExtensionManagerState(
  opts?: ManagerOptions,
): ExtensionManagerState {
  const existing = getLifetime();
  if (existing) {
    existing.getConfiguredShellPath = opts?.getConfiguredShellPath;
    return existing;
  }

  const lifetime = {} as ManagerLifetime;
  lifetime.getConfiguredShellPath = opts?.getConfiguredShellPath;
  lifetime.manager = getManager({
    getConfiguredShellPath: () => lifetime.getConfiguredShellPath?.(),
  });
  lifetime.notifications = createNotificationRegistry();
  lifetime.notificationServiceState = createNotificationServiceState();
  lifetime.cleanupOnExit = () => {
    lifetime.notifications.clear();
    lifetime.manager.killAll();
    lifetime.manager.cleanup();
    clearLifetime(lifetime);
  };

  Reflect.set(globalThis, MANAGER_KEY, lifetime);
  process.once("exit", lifetime.cleanupOnExit);
  return lifetime;
}

/** Reload replaces listeners and UI, but not process or notification state. */
export function shutdownExtensionManager(
  manager: ProcessManager,
  reason: ShutdownReason,
): void {
  if (reason === "reload") return;

  const lifetime = getLifetime();
  if (lifetime?.manager === manager) {
    process.off("exit", lifetime.cleanupOnExit);
    lifetime.notifications.clear();
    clearLifetime(lifetime);
  }

  manager.killAll();
  manager.cleanup();
}
