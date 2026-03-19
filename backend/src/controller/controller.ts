import { FocusGame, FocusState, cloneState } from '../game/focus';
import { alphabeta } from '../ai/alfaBeta';
import { evalFn } from '../ai/focIA';
import { Action, FocusBoardConfig, GetGameResponse, UserPlayResponse } from '@shared-types'

let mainGame: FocusGame | null = null;
let currentState: FocusState | null = null;

export function handleStartGame() : GetGameResponse {
    mainGame = new FocusGame();
    currentState = cloneState(mainGame.initialState);

    return {
			config: {
				size: mainGame.size,
				maxStackHeight: mainGame.maxStackHeight,
				maxPlays: mainGame.maxPlays
			},
      state: {
				to_move: currentState.to_move,
				board: currentState.toJSON().board,
				reserve: currentState.reserve,
				captured: currentState.captured,
				n_plays: currentState.n_plays
			}
    };
}

export function handleUserMovement(req: { action: Action }) : UserPlayResponse {
    if (!mainGame || !currentState) {
        return { error: 'Game not started' };
    }
    const userAction = req.action;
    const event = currentState.applyAction(userAction);

    return { event: event, state: currentState.toJSON() };
}

export function handleAIPlay() {
    if (!mainGame || !currentState) {
        return { error: 'Game not started' };
    }

    const aiResult = alphabeta(mainGame, currentState, 3, -Infinity, Infinity, true, evalFn);
    if (aiResult.action) {
        const event = currentState.applyAction(aiResult.action);
        return { event: event, state: currentState.toJSON() };
    } else {
        return { error: 'AI could not find a move' };
    }
}
