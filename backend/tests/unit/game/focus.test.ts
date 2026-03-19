import { describe, it, expect } from "vitest";
import { FocusGame, printBoardState } from "../../../src/game/focus";
import { Action } from "@shared-types";
import { evalFn } from "src/ai/focIA";
import { alphabeta } from "src/ai/alfaBeta";

function printActions(actions: Action[]) {
  console.log("Possible actions:");
  actions.forEach((action, index) => {
    if (action.kind === "MOVE") {
      console.log(
        `${index + 1}. MOVE from (${action.src.x}, ${action.src.y}) to (${action.dest.x}, ${action.dest.y})`,
      );
    } else if (action.kind === "RESERVE") {
      console.log(
        `${index + 1}. RESERVE to (${action.dest.x}, ${action.dest.y})`,
      );
    }
  });
}

describe("FocusGame", () => {
  it("Must initialize with RED player", () => {
    const game = new FocusGame();
    expect(game.initialState.to_move).toBe("RED");
  });

  it("First RED actions", () => {
    const game = new FocusGame();
    const actions: Action[] = game.actions(game.initialState);
    expect(game.initialState.to_move).toBe("RED");
    expect(game.initialState.n_plays).toBe(0);
    expect(game.initialState.reserve.RED).toBe(0);
    expect(game.initialState.reserve.GREEN).toBe(0);
    expect(game.initialState.captured.RED).toBe(0);
    expect(game.initialState.captured.GREEN).toBe(0);

    // printBoardState(game.initialState);
    // printActions(actions);

    expect(actions.length).equal(28);
  });

  it("First GREEN actions", () => {
    const game = new FocusGame();
    const actions: Action[] = game.actions(game.initialState);
    const result = game.result(game.initialState, actions[0]);
    expect(result.to_move).toBe("GREEN");
    expect(result.n_plays).toBe(1);
    expect(result.reserve.RED).toBe(0);
    expect(result.reserve.GREEN).toBe(0);
    expect(result.captured.RED).toBe(0);
    expect(result.captured.GREEN).toBe(0);

    // printBoardState(result);
    // printActions(game.actions(result));

    expect(game.actions(result).length).equal(26);
  });

  it("Playing against AI til game over", () => {
    const game = new FocusGame();
    let state = game.initialState;

    for (let i = 0; i < 100; i++) {
			if (game.terminalTest(state)) {
				console.log(`Game over! Winner: ${state.winner()}`);
				break;
			}

      const actions = game.actions(state);

			if (actions.length === 0) {
        console.log(`No more actions available for ${state.to_move}`);
        break;
      }

			if (state.to_move === "RED") {
				// User (RED) plays randomly
				// const action = actions[Math.floor(Math.random() * actions.length)];
				// state = game.result(state, action);
				const action = actions[0];
				state = game.result(state, action);
			} else {
				// AI (GREEN) plays using alpha-beta
				const aiResult = alphabeta(game, state, 3, -Infinity, Infinity, true, evalFn);
				if (aiResult.action) {
					state = game.result(state, aiResult.action);
				} else {
					console.log("AI could not find a move");
					break;
				}
			}

			//printBoardState(state);
		}
  });
});
