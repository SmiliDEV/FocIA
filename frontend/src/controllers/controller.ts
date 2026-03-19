import { GameEvent, PlayerColor } from "@shared-types";
import { startGame, userPlay, aiPlay } from "../api/client.js";
import { BoardObject, Piece } from "../ui/board.js";

export class GameController {
  private boardObject: BoardObject;

  private toPiecesStack(stack: string[]): Piece[] {
    return stack
      .filter(
        (piece): piece is PlayerColor => piece === "RED" || piece === "GREEN",
      )
      .map((color) => ({ color }));
  }

  constructor(boardObject: BoardObject) {
    this.boardObject = boardObject;
  }

  async init() {
    const response = await startGame();

    if (response && response.state && response.config) {
      this.boardObject.setBoardConfig(response.config, response.state);
    }
  }

  async processMove(
    src: { x: number; y: number },
    dest: { x: number; y: number },
    quantity: number,
  ) {
    const res = await userPlay({ kind: "MOVE", src, dest, quantity });

    if ("error" in res) {
      console.error("Movimento inválido:", res.error);
      return;
    }

    const event: GameEvent = res.event;

    if (event.type === "MOVE") {
      this.boardObject.animateMove(
        event.sourcePos,
        event.destPos,
        this.toPiecesStack(event.finalDestStack),
      );
    } else if (event.type === "RESERVE") {
      this.boardObject.animateReservePlace(
        event.player,
        event.destPos,
        this.toPiecesStack(event.finalDestStack),
      );
    }

    // ai play
    const response = await aiPlay();

    if ("error" in response) {
      console.error("Movimento inválido:", response.error);
      return;
    }

		// Wait for the player's move animation to finish before processing the AI's move
    while (this.boardObject.isAnimating()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (response && response.event) {
      const event = response.event;
      if (event.type === "MOVE") {
        this.boardObject.animateMove(
          event.sourcePos,
          event.destPos,
          this.toPiecesStack(event.finalDestStack),
        );
      } else if (event.type === "RESERVE") {
        this.boardObject.animateReservePlace(
          event.player,
          event.destPos,
          this.toPiecesStack(event.finalDestStack),
        );
      }
    }
  }

  async processReserve(dest: { x: number; y: number }) {
    const response = await userPlay({ kind: "RESERVE", dest });

		if ("error" in response) {
			console.error("Movimento inválido:", response.error);
			return;
		}

		const event: GameEvent = response.event;
		if (event.type === "MOVE") {
			this.boardObject.animateMove(
				event.sourcePos,
				event.destPos,
				this.toPiecesStack(event.finalDestStack),
			);
		}
		else if (event.type === "RESERVE") {
			this.boardObject.animateReservePlace(
				event.player,
				event.destPos,
				this.toPiecesStack(event.finalDestStack),
			);
		}

		// ai play
		const aiResponse = await aiPlay();
		if ("error" in aiResponse) {
			console.error("Movimento inválido:", aiResponse.error);
			return;
		}

		// Wait for the player's move animation to finish before processing the AI's move
		while (this.boardObject.isAnimating()) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		if (aiResponse && aiResponse.event) {
			const aiEvent = aiResponse.event;
			if (aiEvent.type === "MOVE") {
				this.boardObject.animateMove(
					aiEvent.sourcePos,
					aiEvent.destPos,
					this.toPiecesStack(aiEvent.finalDestStack),
				);
			}
			else if (aiEvent.type === "RESERVE") {
				this.boardObject.animateReservePlace(
					aiEvent.player,
					aiEvent.destPos,
					this.toPiecesStack(aiEvent.finalDestStack),
				);
			}
		}
  }
}
