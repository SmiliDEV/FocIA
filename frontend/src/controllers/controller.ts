import { startGame, userPlay, aiPlay } from '../api/client';
import { BoardObject } from '../ui/board.js';

export class GameController {
    private boardObject: BoardObject;

    constructor(boardObject: BoardObject) {
        this.boardObject = boardObject;
    }

    async init() {
        const response = await startGame();
        if (response && response.state) {
           // setBoardObject here
        }
    }

    async processMove(src: {x: number, y: number}, dest: {x: number, y: number}, quantity: number) {
        const response = await userPlay({ kind: 'MOVE', src, dest, quantity });

        if (response.error) {
            console.error('Movimento inválido:', response.error);
            return;
        }
        const event = response.event;
        this.boardObject.animateMove(event.sourcePos, event.destPos, event.finalDestStack);

        await this.processAITurn();
    }

    async processReserve(dest: {x: number, y: number}) {
        const response = await userPlay({ kind: 'RESERVE', dest });

        if (response.error) {
            console.error('Jogada inválida:', response.error);
            return;
        }

        const event = response.event;
        this.boardObject.animateReservePlace(event.player, event.destPos, event.finalDestStack);

        await this.processAITurn();
    }

    private async processAITurn() {
        const response = await aiPlay();

        if (!response.error && response.event) {
            const event = response.event;
            if (event.type === 'MOVE') {
                this.boardObject.animateMove(event.sourcePos, event.destPos, event.finalDestStack);
            } else if (event.type === 'RESERVE') {
                this.boardObject.animateReservePlace(event.player, event.destPos, event.finalDestStack);
            }
        }
    }
}
