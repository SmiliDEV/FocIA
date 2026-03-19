import type {
  Action,
  CapturedCount,
  Coords,
  FocusStateDTO,
  GameEvent,
  PlayerColor,
  ReserveCount,
} from "@shared-types";

export const MAX_JOGADAS = 250;
export const MAX_ALTURA_PILHA = 3;
export const TAMANHO_TABULEIRO = 6;

export type Board = Map<string, PlayerColor[]>;

export const equals = (a: Coords, b: Coords) => a.x === b.x && a.y === b.y;

// Helpers to maintain string O(1) map lookups but use Coords everywhere else
export const toKey = (c: Coords) => `${c.x},${c.y}`;
export const toCoords = (key: string): Coords => {
  const [x, y] = key.split(",");
  return { x: Number(x), y: Number(y) };
};

const isPlayableCell = (x: number, y: number): boolean => {
  if (x < 0 || x >= TAMANHO_TABULEIRO || y < 0 || y >= TAMANHO_TABULEIRO) {
    return false;
  }

  // octagonal board
  const edgeDistance = Math.min(y, TAMANHO_TABULEIRO - 1 - y);
  const inset = Math.max(0, 2 - edgeDistance);
  return x >= inset && x <= TAMANHO_TABULEIRO - 1 - inset;
};

const isPlayerColor = (value: string): value is PlayerColor => {
  return value === "RED" || value === "GREEN";
};

export function getAllPositions(
  boardSize: number = TAMANHO_TABULEIRO,
): Set<string> {
  const positions = new Set<string>();

  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      if (isPlayableCell(x, y)) {
        positions.add(`${x},${y}`);
      }
    }
  }

  return positions;
}

export const ALL_POSITIONS = getAllPositions();

export function createInitialBoard(): Board {
  const board = new Map<string, PlayerColor[]>();

  // Initialize all playable cells as empty stacks.
  for (const posKey of ALL_POSITIONS) {
    board.set(posKey, []);
  }

  for (let x = 0; x < TAMANHO_TABULEIRO; x++) {
    for (let y = 0; y < TAMANHO_TABULEIRO; y++) {
      // Only the center 4x4 starts populated.
      if (x >= 1 && x <= 4 && y >= 1 && y <= 4) {
        const lx = x - 1;
        const ly = y - 1;
        const color: PlayerColor =
          (ly % 2 === 0 && lx >= 2) || (ly % 2 !== 0 && lx < 2)
            ? "RED"
            : "GREEN";
        board.set(`${x},${y}`, [color]);
      }
    }
  }

  return board;
}

export function printBoardState(state: FocusState): void {
  console.log("=== FOCUS STATE ===");
  console.log(`to_move: ${state.to_move}`);
  console.log(`n_plays: ${state.n_plays}`);
  console.log(`reserve: RED=${state.reserve.RED} GREEN=${state.reserve.GREEN}`);
  console.log(
    `captured: RED=${state.captured.RED} GREEN=${state.captured.GREEN}`,
  );

  for (let y = 0; y < TAMANHO_TABULEIRO; y++) {
    const row: string[] = [`y=${y}`];

    for (let x = 0; x < TAMANHO_TABULEIRO; x++) {
      const posKey = `${x},${y}`;
      if (ALL_POSITIONS.has(posKey)) {
        const stack = state.board.get(posKey) || [];
        // if the stack is from top to bottom: GREEN, RED -> print "GR "
        // if the stack is empty, print "   "
        let cellStr = "";
        for (let i = 0; i < MAX_ALTURA_PILHA; i++) {
          if (i < stack.length) {
            cellStr += stack[i] === "RED" ? "R" : "G";
          } else {
            cellStr += " ";
          }
        }
        //const cellStr = stack.length > 0 ? stack.map((p) => (p === "RED" ? "R" : "G")).join("") : "   ";
        row.push(`${cellStr}`);
      } else {
        row.push(`   `);
      }
    }

    console.log(row.join(" | "));
  }

	console.log("x=   0     1     2     3     4     5");
}

export class FocusState {
  to_move: PlayerColor;
  board: Board;
  reserve: ReserveCount;
  captured: CapturedCount;
  n_plays: number;

  constructor(
    to_move: PlayerColor,
    board: Board,
    reserve: ReserveCount,
    captured: CapturedCount,
    n_plays: number,
  ) {
    this.to_move = to_move;
    this.board = board;
    this.reserve = reserve;
    this.captured = captured;
    this.n_plays = n_plays;
  }

  isValidPosition(pos: Coords): boolean {
    return ALL_POSITIONS.has(toKey(pos));
  }

  getPieceStack(pos: Coords): PlayerColor[] {
    return this.board.get(toKey(pos)) || [];
  }

  topPiece(pos: Coords): PlayerColor | null {
    return this.board.get(toKey(pos))?.at(-1) || null;
  }
  verifyPosition(
    srcPos: Coords,
    destPos: Coords,
    player: PlayerColor,
  ): boolean {
    const srcStack = this.getPieceStack(srcPos);
    if (srcStack.length === 0 || srcStack.at(-1) !== player) {
      return false;
    }
    const steps = srcStack.length;
    const dx = destPos.x - srcPos.x;
    const dy = destPos.y - srcPos.y;
    const isOrthogonal =
      (Math.abs(dx) === steps && dy === 0) ||
      (Math.abs(dy) === steps && dx === 0);
    return isOrthogonal && this.isValidPosition(destPos);
  }

  calculateNewPosition(pos: Coords, direction: string, steps: number): Coords {
    const { x, y } = pos;
    switch (direction) {
      case "up":
        return { x, y: y - steps };
      case "down":
        return { x, y: y + steps };
      case "left":
        return { x: x - steps, y };
      case "right":
        return { x: x + steps, y };
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
        for (const direction of ["up", "down", "left", "right"]) {
          const newPos = this.calculateNewPosition(
            pos,
            direction,
            stack.length,
          );
          if (this.isValidPosition(newPos)) {
            moves.push({ kind: "MOVE", src: pos, dest: newPos });
          }
        }
      }
    }

    if (this.reserve[this.to_move] > 0) {
      for (const posKey of ALL_POSITIONS) {
        const destStack = this.board.get(posKey) || [];
        if (destStack.length < MAX_ALTURA_PILHA) {
          moves.push({ kind: "RESERVE", dest: toCoords(posKey) });
        }
      }
    }

    return moves;
  }

  applyAction(action: Action): GameEvent {
    const currentPlayer = this.to_move;

    if (action.kind === "RESERVE") {
      if (!this.isValidPosition(action.dest)) {
        throw new Error(
          "Invalid reserve destination: outside orthogonal board",
        );
      }

      const destKey = toKey(action.dest);
      const stack = this.board.get(destKey) || [];

      // Colocar peça da reserva
      this.board.set(destKey, [...stack, this.to_move]);
      this.reserve[this.to_move]--;
      this.adjustStack(destKey);

      this.n_plays++;
      const winner = this.winner();
      this.to_move = this.to_move === "RED" ? "GREEN" : "RED";

      return {
        type: "RESERVE",
        action: action,
        player: currentPlayer,
        destPos: action.dest,
        finalDestStack: this.board.get(destKey) || [],
        captured: this.captured[currentPlayer],
        reserved: this.reserve[currentPlayer],
        winner: winner,
      };
    } else {
      if (
        !this.isValidPosition(action.src) ||
        !this.isValidPosition(action.dest)
      ) {
        throw new Error("Invalid move: outside orthogonal board");
      }

      if (!this.verifyPosition(action.src, action.dest, this.to_move)) {
        throw new Error(
          "Invalid move: source/destination not orthogonally reachable",
        );
      }

      const sourceKey = toKey(action.src);
      const destKey = toKey(action.dest);

      const movingStack = this.board.get(sourceKey)!;
      this.board.delete(sourceKey); // Esvazia origem

      const destStack = this.board.get(destKey) || [];
      this.board.set(destKey, [...destStack, ...movingStack]);
      this.adjustStack(destKey);

      this.n_plays++;
      const winner = this.winner();
      this.to_move = this.to_move === "RED" ? "GREEN" : "RED";

      return {
        type: "MOVE",
        action: action,
        player: currentPlayer,
        sourcePos: action.src,
        destPos: action.dest,
        finalDestStack: this.board.get(destKey) || [],
        captured: this.captured[currentPlayer],
        reserved: this.reserve[currentPlayer],
        winner: winner,
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

  winner(): PlayerColor | null {
    if (this.n_plays < MAX_JOGADAS) {
      return this.whoDominate();
    } else {
      const redPiles = this.dominatePiles("RED");
      const greenPiles = this.dominatePiles("GREEN");
      if (redPiles > greenPiles) return "RED";
      if (redPiles < greenPiles) return "GREEN";
      return null;
    }
  }

  whoDominate(): PlayerColor | null {
    let hasRed = false;
    let hasGreen = false;

    for (const stack of this.board.values()) {
      const top = stack.at(-1);
      if (top === "RED") hasRed = true;
      if (top === "GREEN") hasGreen = true;
      if (hasRed && hasGreen) return null;
    }

    if (hasRed) return "RED";
    if (hasGreen) return "GREEN";
    return null;
  }

  dominatePiles(player: PlayerColor): number {
    let count = 0;
    for (const stack of this.board.values()) {
      if (stack.length > 0 && stack.at(-1) === player) {
        count++;
      }
    }
    return count;
  }

  toJSON(): FocusStateDTO {
    return {
      to_move: this.to_move,
      board: Array.from(this.board.entries()),
      reserve: { ...this.reserve },
      captured: { ...this.captured },
      n_plays: this.n_plays,
    };
  }

  static fromJSON(json: FocusStateDTO): FocusState {
    const board = new Map<string, PlayerColor[]>(
      json.board.map(([pos, stack]) => [
        pos,
        stack.filter((piece): piece is PlayerColor => isPlayerColor(piece)),
      ]),
    );
    return new FocusState(
      json.to_move,
      board,
      { ...json.reserve },
      { ...json.captured },
      json.n_plays,
    );
  }
}

export class FocusGame {
  initialState: FocusState;
  size: number = TAMANHO_TABULEIRO;
  maxStackHeight: number = MAX_ALTURA_PILHA;
  maxPlays: number = MAX_JOGADAS;

  constructor() {
    this.initialState = new FocusState(
      "RED",
      createInitialBoard(),
      { RED: 1, GREEN: 1 },
      { RED: 0, GREEN: 0 },
      0,
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
    return state.winner() !== null || state.n_plays >= MAX_JOGADAS;
  }
}

export function cloneState(state: FocusState): FocusState {
  const newBoard = new Map<string, PlayerColor[]>();

  for (const [pos, stack] of state.board) {
    newBoard.set(pos, [...stack]);
  }

  return new FocusState(
    state.to_move,
    newBoard,
    { ...state.reserve },
    { ...state.captured },
    state.n_plays,
  );
}
export { Action };
