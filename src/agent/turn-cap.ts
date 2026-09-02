/**
 * Turn cap.
 *
 * Pi's loop runs until the model stops calling tools, with no step limit anywhere
 * in the engine. That is fine for a coding session a human is watching and wrong for
 * an unattended browser task, where a confused agent will happily click forever.
 *
 * A capped task is reported as capped, not failed: "ran out of room" and "did the
 * wrong thing" call for different responses.
 */

export interface TurnCapState {
  readonly limit: number;
  turns: number;
  capped: boolean;
}

export function createTurnCap(limit: number): TurnCapState {
  return { limit, turns: 0, capped: false };
}

/** Returns true when this turn crossed the cap. */
export function countTurn(state: TurnCapState): boolean {
  state.turns += 1;
  if (state.turns >= state.limit && !state.capped) {
    state.capped = true;
    return true;
  }
  return false;
}

export interface PiLikeForTurnCap {
  on(event: "turn_end", handler: (event: unknown, ctx: { abort?: () => unknown }) => unknown): void;
}

export interface TurnCapOptions {
  enabled?: boolean;
  onCap?: (state: TurnCapState) => void;
}

export function registerTurnCap(
  pi: PiLikeForTurnCap,
  limit: number,
  options: TurnCapOptions = {},
): TurnCapState {
  const state = createTurnCap(limit);
  if (options.enabled === false) return state;
  pi.on("turn_end", (_event, ctx) => {
    if (countTurn(state)) {
      options.onCap?.(state);
      ctx.abort?.();
    }
  });
  return state;
}
