import { useState, useSyncExternalStore } from 'react';

import { TurnstileController, type TurnstileControllerOptions } from '../controller/TurnstileController';
import type { TurnstileState } from '../core/status';

/**
 * Creates a controller that lives as long as the component.
 *
 * It holds no native resource: when the widget unmounts it detaches the
 * controller, which stops its timer. Call `dispose()` yourself only if you
 * want to reject pending `waitForToken` calls.
 */
export function useTurnstileController(options?: TurnstileControllerOptions): TurnstileController {
  const [controller] = useState(() => new TurnstileController(options));
  return controller;
}

/** Re-renders the component when the controller state changes. */
export function useTurnstileState(controller: TurnstileController): TurnstileState {
  return useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
}
