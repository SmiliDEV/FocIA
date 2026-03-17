export const MAX_JOGADAS = 250;
export const MAX_ALTURA_PILHA = 3;
export const TAMANHO_TABULEIRO = 4;

export type Board = Map<string, string[]>;
export type Reserve = { [key: string]: number };
export type Captured = { [key: string]: number };
export type MoveAction = { kind: 'MOVE', src: Coords, dest: Coords };
export type ReserveAction = { kind: 'RESERVE', dest: Coords };
export type Action = MoveAction | ReserveAction;
export type Coords = { x: number, y: number };
export const equals = (a: Coords, b: Coords) => a.x === b.x && a.y === b.y;

// Helpers to maintain string O(1) map lookups but use Coords everywhere else
export const toKey = (c: Coords) => `${c.x},${c.y}`;
export const toCoords = (key: string): Coords => { 
    const [x, y] = key.split(','); 
    return { x: Number(x), y: Number(y) }; 
};

export interface MoveEvent {
    type: 'MOVE';
    action: MoveAction;
    player: string;
    sourcePos: Coords;
    destPos: Coords;
    finalDestStack: string[];
    captured: number;
    reserved: number;
    winner: string | null;
}

export interface ReserveEvent {
    type: 'RESERVE';
    action: ReserveAction;
    player: string;
    destPos: Coords;
    finalDestStack: string[];
    captured: number;
    reserved: number;
    winner: string | null;
}

export type GameEvent = MoveEvent | ReserveEvent;

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

    isValidPosition(pos: Coords): boolean {
        return ALL_POSITIONS.has(toKey(pos));
    }

    getPieceStack(pos: Coords): string[] {
        return this.board.get(toKey(pos)) || [];
    }

    topPiece(pos: Coords): string | null {
        return this.board.get(toKey(pos))?.at(-1) || null;
    }
    verifyPosition(srcPos: Coords, destPos: Coords, player: string): boolean {
        const srcStack = this.getPieceStack(srcPos);
        if (srcStack.length === 0 || srcStack.at(-1) !== player) {
            return false; 
        } 
        const steps = srcStack.length;
        const dx = destPos.x - srcPos.x;
        const dy = destPos.y - srcPos.y;
        const isOrthogonal = (Math.abs(dx) === steps && dy === 0) || (Math.abs(dy) === steps && dx === 0);
        return isOrthogonal && this.isValidPosition(destPos);
    }

    calculateNewPosition(pos: Coords, direction: string, steps: number): Coords {
        const { x, y } = pos;
        switch (direction) {
            case 'up': return { x, y: y - steps };
            case 'down': return { x, y: y + steps };
            case 'left': return { x: x - steps, y };
            case 'right': return { x: x + steps, y };
        }
        return pos;
    }


    // Para IA
    possibleMoves(): Action[] {
        const moves: Action[] = [];
        const boardEntries = Array.from(this.board.entries());

        for (const [posKey, stack] of boardEntries) {
            const pos = toCoords(posKey);
            if (stack.length > 0 && stack.at(-1) === this.to_move) {
                for (const direction of ['up', 'down', 'left', 'right']) {
                    const newPos = this.calculateNewPosition(pos, direction, stack.length);
                    if (this.isValidPosition(newPos)) {
                        moves.push({ kind: 'MOVE', src: pos, dest: newPos });
                    }
                }
            }
        }

        if (this.reserve[this.to_move] > 0) {
            for (const posKey of ALL_POSITIONS) {
                const destStack = this.board.get(posKey) || [];
                if (destStack.length < MAX_ALTURA_PILHA) {
                    moves.push({ kind: 'RESERVE', dest: toCoords(posKey) });
                }
            }
        }

        return moves;
    }

    applyAction(action: Action): GameEvent {
        const currentPlayer = this.to_move;

        if (action.kind === 'RESERVE') {
            const destKey = toKey(action.dest);
            const stack = this.board.get(destKey) || [];
            
            // Colocar peça da reserva
            this.board.set(destKey, [...stack, this.to_move]);
            this.reserve[this.to_move]--;
            this.adjustStack(destKey);

            this.n_jogadas++;
            const winner = this.winner();
            this.to_move = this.to_move === 'RED' ? 'GREEN' : 'RED';

            return {
                type: 'RESERVE',
                action: action,
                player: currentPlayer,
                destPos: action.dest,
                finalDestStack: this.board.get(destKey) || [],
                captured: this.captured[currentPlayer],
                reserved: this.reserve[currentPlayer],
                winner: winner 
            };
        } else {
            const sourceKey = toKey(action.src);
            const destKey = toKey(action.dest);
            
            const movingStack = this.board.get(sourceKey)!;
            this.board.delete(sourceKey); // Esvazia origem

            const destStack = this.board.get(destKey) || [];
            this.board.set(destKey, [...destStack, ...movingStack]);
            this.adjustStack(destKey);

            this.n_jogadas++;
            const winner = this.winner();
            this.to_move = this.to_move === 'RED' ? 'GREEN' : 'RED';

            return {
                type: 'MOVE',
                action: action,
                player: currentPlayer,
                sourcePos: action.src,
                destPos: action.dest,
                finalDestStack: this.board.get(destKey) || [],
                captured: this.captured[currentPlayer],
                reserved: this.reserve[currentPlayer],
                winner: winner 
            };
        }
    }

    private adjustStack(pos: string): void {
        const stack = this.board.get(pos)!;

        while (stack.length > MAX_ALTURA_PILHA) {
            const removed = stack.shift()!; 
            if (removed === this.to_move) {
                this.reserve[this.to_move]++;
            } else {
                this.captured[this.to_move]++;
            }
        }
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

