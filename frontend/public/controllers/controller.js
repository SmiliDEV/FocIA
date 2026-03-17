import { startGame, userPlay, aiPlay } from '../api/client.js';
export class GameController {
    boardObject;
    constructor(boardObject) {
        this.boardObject = boardObject;
    }
    async init() {
        const response = await startGame();
        if (response && response.state) {
            // tamanho do tabuleiro
            // tamanho das pilhas
            // estado tabuleiro inicial
            // máximo de jogadas
            // primeiro jogador
            // setBoardObject here
        }
    }

		async processMove(src, dest, quantity) {
        const response = await userPlay({ kind: 'MOVE', src, dest, quantity });
        if (response.error) {
            console.error('Movimento inválido:', response.error);
            return;
        }
        const event = response.event;
        this.boardObject.animateMove(event.sourcePos, event.destPos, event.finalDestStack);
        await this.processAITurn();
    }

    async processReserve(dest) {
        const response = await userPlay({ kind: 'RESERVE', dest });
        if (response.error) {
            console.error('Jogada inválida:', response.error);
            return;
        }
        const event = response.event;
        this.boardObject.animateReservePlace(event.player, event.destPos, event.finalDestStack);
        await this.processAITurn();
    }
    async processAITurn() {
        const response = await aiPlay();
        if (!response.error && response.event) {
            const event = response.event;
            if (event.type === 'MOVE') {
                this.boardObject.animateMove(event.sourcePos, event.destPos, event.finalDestStack);
            }
            else if (event.type === 'RESERVE') {
                this.boardObject.animateReservePlace(event.player, event.destPos, event.finalDestStack);
            }
        }
    }
}
//# sourceMappingURL=controller.js.map