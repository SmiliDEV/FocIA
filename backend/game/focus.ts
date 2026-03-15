export const MAX_JOGADAS = 250;
export const MAX_ALTURA_PILHA = 3;
export const TAMANHO_TABULEIRO = 4;

export type Board = Map<string, string[]>;
export type Reserve = { [key: string]: number };
export type Captured = { [key: string]: number };
export type MoveAction = { kind: 'move', from: string, direction: string };
export type ReserveAction = { kind: 'reserve', dest: string };
export type Action = MoveAction | ReserveAction;

export interface GameEvent {
    // sqe pode haver mais tipos dps 
    type: 'action_completed';
    action: Action;            // A ação que foi executada
    player: string;            // Quem executou a ação
    

    sourcePos: string | null;  // Posição de origem (null se for da reserva)
    destPos: string;           // Posição de destino
    finalSourceStack: string[];// Estado da pilha de origem após o movimento
    finalDestStack: string[];  // Estado da pilha de destino após o movimento
    
    // Consequências
    captured: number;          // Quantas peças foram capturadas nesta jogada
    reserved: number;          // Quantas peças foram para a reserva nesta jogada
    winner: string | null;     // Se a jogada terminou o jogo, quem venceu?
}

export function getAllPositions(boardSize: number = TAMANHO_TABULEIRO): Set<string> {
    const positions = new Set<string>();
    
    for (let x = 0; x < boardSize; x++) {
        for (let y = 0; y < boardSize; y++) {
            positions.add(`${x},${y}`);
        }
    }
    
    for (let i = 1; i < boardSize - 1; i++) {
        positions.add(`-1,${i}`);
        positions.add(`${boardSize},${i}`);
        positions.add(`${i},-1`);
        positions.add(`${i},${boardSize}`);
    }
    
    return positions;
}

export const ALL_POSITIONS = getAllPositions();

export function createInitialBoard(): Board {
    const board = new Map<string, string[]>();
    const posPares = new Set<number>();
    const posImpares = new Set<number>();
    
    for (let k = 0; k < TAMANHO_TABULEIRO; k++) {
        posPares.add(2 + TAMANHO_TABULEIRO * k);
        posPares.add(3 + TAMANHO_TABULEIRO * k);
        posImpares.add(0 + TAMANHO_TABULEIRO * k);
        posImpares.add(1 + TAMANHO_TABULEIRO * k);
    }
    
    for (let x = 0; x < TAMANHO_TABULEIRO; x++) {
        for (let y = 0; y < TAMANHO_TABULEIRO; y++) {
            let color;
            if ((y % 2 === 0 && posPares.has(x)) || (y % 2 !== 0 && posImpares.has(x))) {
                color = 'RED';
            } else {
                color = 'GREEN';
            }
            board.set(`${x},${y}`, [color]);
        }
    }
    return board;
}

export class FocusState {
    to_move: string;
    board: Board;
    reserve: Reserve;
    captured: Captured;
    n_jogadas: number;

    constructor(
        to_move: string, 
        board: Board, 
        reserve: Reserve, 
        captured: Captured, 
        n_jogadas: number
    ) {
        this.to_move = to_move;
        this.board = board;
        this.reserve = reserve;
        this.captured = captured;
        this.n_jogadas = n_jogadas;
    }

    isValidPosition(pos: string): boolean {
        return ALL_POSITIONS.has(pos);
    }

    getPieceStack(pos: string): string[] {
        return this.board.get(pos) || [];
    }

    topPiece(pos: string): string | null {
        return this.board.get(pos)?.at(-1) || null;
    }

    calculateNewPosition(pos: string, direction: string, steps: number): string {
        const [x, y] = pos.split(',').map(Number);
        switch (direction) {
            case 'up': return `${x},${y - steps}`;
            case 'down': return `${x},${y + steps}`;
            case 'left': return `${x - steps},${y}`;
            case 'right': return `${x + steps},${y}`;
        }
        return pos;
    }

    possibleMoves(): Action[] {
        const moves: Action[] = [];
        const boardEntries = Array.from(this.board.entries());

        for (const [pos, stack] of boardEntries) {
            if (stack.length > 0 && stack.at(-1) === this.to_move) {
                for (const direction of ['up', 'down', 'left', 'right']) {
                    const newPos = this.calculateNewPosition(pos, direction, stack.length);
                    if (this.isValidPosition(newPos)) {
                        moves.push({ kind: 'move', from: pos, direction: direction });
                    }
                }
            }
        }

        if (this.reserve[this.to_move] > 0) {
            for (const pos of ALL_POSITIONS) {
                moves.push({ kind: 'reserve', dest: pos });
            }
        }

        return moves;
    }

    /**
     * Aplica uma ação e retorna um evento descrevendo o que aconteceu.
     */
    applyAction(action: Action): GameEvent {
        const currentPlayer = this.to_move;
        let sourcePos: string | null = null;
        let destPos = '';
        
        // Resultados do ajuste da pilha
        let moveEffects = { captured: 0, reserved: 0 };

        if (action.kind === 'reserve') {
            destPos = action.dest;
            const stack = this.board.get(destPos) || [];
            
            // Colocar peça da reserva
            this.board.set(destPos, [...stack, this.to_move]);
            this.reserve[this.to_move]--;
            
            // Verificar altura
            moveEffects = this.adjustStack(destPos);
        } else {
            sourcePos = action.from;
            const direction = action.direction;
            const stack = this.board.get(sourcePos)!;
            const steps = stack.length;
            const newPos = this.calculateNewPosition(sourcePos, direction, steps);
            destPos = newPos; // Para o evento
            
            const movingStack = stack;
            this.board.delete(sourcePos); // Esvazia origem

            const destStack = this.board.get(newPos) || [];
            this.board.set(newPos, [...destStack, ...movingStack]);
            
            // Verificar altura na nova posição
            moveEffects = this.adjustStack(newPos);
        }
        // importante pros eventos 
        this.n_jogadas++;
        const winner = this.winner();
        this.to_move = this.to_move === 'RED' ? 'GREEN' : 'RED';

        return {
            type: 'action_completed',
            action: action,
            player: currentPlayer,
            sourcePos: sourcePos,
            destPos: destPos,
            finalSourceStack: sourcePos ? (this.board.get(sourcePos) || []) : [], // Deve estar vazia se foi 'move'
            finalDestStack: this.board.get(destPos) || [],
            captured: moveEffects.captured,
            reserved: moveEffects.reserved,
            winner: winner
        };
    }

    private adjustStack(pos: string): { captured: number, reserved: number } {
        const stack = this.board.get(pos)!;
        let capturedCount = 0;
        let reservedCount = 0;

        while (stack.length > MAX_ALTURA_PILHA) {
            const removed = stack.shift()!; // Remove da base (índice 0)
            if (removed === this.to_move) {
                this.reserve[this.to_move]++;
                reservedCount++;
            } else {
                this.captured[this.to_move]++;
                capturedCount++;
            }
        }
        
        return { captured: capturedCount, reserved: reservedCount };
    }

    other(): string {
        return this.to_move === 'RED' ? 'GREEN' : 'RED';
    }

    winner(): string | null {
        if (this.n_jogadas < MAX_JOGADAS) {
            return this.whoDominate();
        } else {
            const redPiles = this.dominatePiles('RED');
            const greenPiles = this.dominatePiles('GREEN');
            if (redPiles > greenPiles) return 'RED';
            if (redPiles < greenPiles) return 'GREEN';
            return null;
        }
    }

    whoDominate(): string | null {
        let hasRed = false;
        let hasGreen = false;
        
        for (const stack of this.board.values()) {
            const top = stack.at(-1);
            if (top === 'RED') hasRed = true;
            if (top === 'GREEN') hasGreen = true;
            if (hasRed && hasGreen) return null;
        }
        
        if (hasRed) return 'RED';
        if (hasGreen) return 'GREEN';
        return null;
    }

    dominatePiles(player: string): number {
        let count = 0;
        for (const stack of this.board.values()) {
            if (stack.length > 0 && stack.at(-1) === player) {
                count++;
            }
        }
        return count;
    }

    toJSON(): any {
        return {
            to_move: this.to_move,
            board: Array.from(this.board.entries()),
            reserve: { ...this.reserve },
            captured: { ...this.captured },
            n_jogadas: this.n_jogadas
        };
    }

    static fromJSON(json: any): FocusState {
        const board = new Map<string, string[]>(json.board);
        return new FocusState(
            json.to_move,
            board,
            { ...json.reserve },
            { ...json.captured },
            json.n_jogadas
        );
    }
}

export class FocusGame {
    initialState: FocusState;

    constructor() {
        this.initialState = new FocusState(
            'RED',
            createInitialBoard(),
            { 'RED': 0, 'GREEN': 0 },
            { 'RED': 0, 'GREEN': 0 },
            0
        );
    }

    actions(state: FocusState): Action[] {
        return state.possibleMoves();
    }

    result(state: FocusState, action: Action): FocusState {
        // Agora applyAction retorna um evento, mas para a IA (que usa result)
        // o que importa é a mutação do estado. Podemos ignorar o retorno aqui.
        state.applyAction(action);
        return state;
    }

    utility(state: FocusState, player: string): number {
        const winner = state.winner();
        if (!winner) return 0;
        return winner === player ? 1 : -1;
    }

    terminalTest(state: FocusState): boolean {
        return state.winner() !== null || state.n_jogadas >= MAX_JOGADAS;
    }
}

export function cloneState(state: FocusState): FocusState {
    const newBoard = new Map<string, string[]>();
    for (const [pos, stack] of state.board) {
        newBoard.set(pos, [...stack]);
    }
    return new FocusState(
        state.to_move,
        newBoard, 
        { ...state.reserve },
        { ...state.captured },
        state.n_jogadas
    );
}

