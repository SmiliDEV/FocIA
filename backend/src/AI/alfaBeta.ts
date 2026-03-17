import { FocusGame, FocusState, cloneState, Action } from '../game/focus';

export function alphabeta(
    game: FocusGame, 
    state: FocusState, 
    depth: number, 
    alpha: number = -Infinity, 
    beta: number = Infinity, 
    maximizingPlayer: boolean = true,
    evalFn: (state: FocusState, player: string) => number
): { action: Action | null, value: number } {
    
    const player = maximizingPlayer ? state.to_move : (state.to_move === 'RED' ? 'GREEN' : 'RED'); 


    if (depth === 0 || game.terminalTest(state)) {
        const value = evalFn(state, player);
        return { action: null, value: value };
    }

    let bestAction: Action | null = null;
    const actions = game.actions(state);

    // If no moves available but not terminal (e.g. stalemate?), terminalTest should catch it.
    // But if actions is empty:
    if (actions.length === 0) {
        return { action: null, value: evalFn(state, player) };
    }

    if (maximizingPlayer) {
        let value = -Infinity;
        for (const action of actions) {
            const childState = cloneState(state);
            game.result(childState, action);
            
            const result = alphabeta(game, childState, depth - 1, alpha, beta, false, evalFn);
            
            if (result.value > value) {
                value = result.value;
                bestAction = action;
            }
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        return { action: bestAction, value: value };
    } else {
        let value = Infinity;
        for (const action of actions) {
            const childState = cloneState(state);
            game.result(childState, action);
            
            const result = alphabeta(game, childState, depth - 1, alpha, beta, true, evalFn);
            
            if (result.value < value) {
                value = result.value;
                bestAction = action;
            }
            beta = Math.min(beta, value);
            if (beta <= alpha) break;
        }
        return { action: bestAction, value: value };
    }
}
