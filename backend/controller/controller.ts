import { FocusGame, FocusState, Action, cloneState } from '../game/focus';
import { alphabeta } from '../AI/alfaBeta';
import { evalFn } from '../AI/focIA';

let mainGame: FocusGame | null = null;
let currentState: FocusState | null = null;

export function handleStartGame() {
    mainGame = new FocusGame();
    currentState = cloneState(mainGame.initialState);
    
    return { 
        message: 'Game started successfully',
        state: currentState.toJSON() 
    };
} 

export function handleUserMovement(req: { action: Action }) {
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
        return currentState.applyAction(aiResult.action);
        
    } else {
        return { error: 'AI could not find a move' };
    }
}
