import { handleStartGame } from "src/controller/controller";
import { FocusGame } from "src/game/focus";
import { describe, expect, it } from "vitest";

describe("Controller", () => {
  it("Must initialize with RED player", () => {
    const game = new FocusGame()

		const response = handleStartGame();
		console.log(response.state.board);

    expect(response.state.to_move).toBe("RED");
		expect(response.state.n_plays).toBe(0);
		expect(response.state.reserve.RED).toBe(0);
		expect(response.state.reserve.GREEN).toBe(0);
		expect(response.state.captured.RED).toBe(0);
		expect(response.state.captured.GREEN).toBe(0);

		// Check board structure
		expect(Array.isArray(response.state.board)).toBe(true)
		expect(response.state.board.length).greaterThan(0);
		response.state.board.forEach(stack => {
			expect(Array.isArray(stack)).toBe(true);
			expect(stack.length).toBe(2);
			expect(typeof stack[0]).toBe("string");
			expect(Array.isArray(stack[1])).toBe(true);
		});
	});
});