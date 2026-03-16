import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export const MAX_JOGADAS = 250;
export const MAX_ALTURA_PILHA = 3;
export const TAMANHO_TABULEIRO = 6;

export type Color = "red" | "green";

export interface Player {
  color: Color;
  capturedPieces: number;
  reservedPieces: number;
}

export interface MeshPiece {
  mesh: THREE.Mesh;
}

export type StackMesh = THREE.Mesh | null;

export type BoardPieceMesh = THREE.Mesh | null;

export interface Piece {
  color: Color;
}

export type Stack = Piece[] | null;

export type StackUserData = {
  kind: "stack";
  row: number;
  col: number;
  level: number;
};

export type BoardPieceUserData = {
  kind: "board";
  row: number;
  col: number;
};

export type Move = {
  toRow: number;
  toCol: number;
};

const p = (color: Color): Piece => ({ color });

const initialBoard: Stack[][] = [
  [null, null, [], [], null, null],
  [null, [p("green")], [p("green")], [p("red")], [p("red")], null],
  [[], [p("red")], [p("red")], [p("green")], [p("green")], []],
  [[], [p("green")], [p("green")], [p("red")], [p("red")], []],
  [null, [p("red")], [p("red")], [p("green")], [p("green")], null],
  [null, null, [], [], null, null],
];

const testBoard: Stack[][] = [
  [null, null, [], [], null, null],
  [
    null,
    [p("green"), p("red")],
    [p("green"), p("red")],
    [p("red"), p("green")],
    [p("red"), p("green")],
    null,
  ],
  [[], [p("red")], [p("red")], [p("green")], [p("green")], []],
  [[], [p("green")], [p("green")], [p("red")], [p("red")], []],
  [null, [p("red")], [p("red")], [p("green")], [p("green")], null],
  [null, null, [], [], null, null],
];

export class BoardState {
  private turn: Color = "red";
  private players: Record<Color, Player> = {
    red: { color: "red", capturedPieces: 0, reservedPieces: 2 },
    green: { color: "green", capturedPieces: 0, reservedPieces: 2 },
  };
  private _board: Stack[][];

  constructor() {
    this._board = testBoard.map((r) => [...r]);
  }

  get board(): ReadonlyArray<ReadonlyArray<Stack>> {
    return this._board;
  }

  getTurn(): Color {
    return this.turn;
  }

  getStack(row: number, col: number): Stack {
    return this.board[row]?.[col] ?? null;
  }

  move(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
  ): boolean {
    const stack = this.getStack(fromRow, fromCol);
    return true;
  }

  possibleMoves(row: number, col: number): Move[] {
    if (!this.getStack(row, col) || this.getStack(row, col)?.length === 0)
      return [];

    const moves: Move[] = [];
    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    const pieceCount = this.getStack(row, col)?.length || 0;
    for (const { dr, dc } of directions) {
      const newRow = row + dr * pieceCount;
      const newCol = col + dc * pieceCount;

      if (
        newRow < 0 ||
        newRow >= this.board.length ||
        newCol < 0 ||
        newCol >= this.board[0].length ||
        this.getStack(newRow, newCol) === null
      )
        continue;

      moves.push({ toRow: newRow, toCol: newCol });
    }

    return moves;
  }

  playMove(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
  ): boolean {
    const stack = this.getStack(fromRow, fromCol);
    if (!stack || stack.length === 0) return false;

    const possible = this.possibleMoves(fromRow, fromCol);
    if (!possible.some((m) => m.toRow === toRow && m.toCol === toCol))
      return false;

    this._board[toRow][toCol] = [
      ...(this.getStack(toRow, toCol) ?? []),
      ...stack,
    ];
    this._board[fromRow][fromCol] = [];
    this.turn = this.turn === "red" ? "green" : "red";
    return true;
  }

  playReserve(toRow: number, toCol: number): boolean {
    if (!this.haveReservedPieces(this.turn)) return false;
    if (this.getStack(toRow, toCol) === null) return false;

    this._board[toRow][toCol] = [
      ...(this.getStack(toRow, toCol) ?? []),
      { color: this.turn },
    ];
    this.players[this.turn].reservedPieces--;
    this.turn = this.turn === "red" ? "green" : "red";
    return true;
  }

  isStackMovable(row: number, col: number): boolean {
    const stack = this.getStack(row, col);
    if (stack?.length === 0 || stack === null) return false;
    if (stack[stack.length - 1].color !== this.turn) return false;
    //if (this.possibleMoves(row, col).length === 0) return false;

    return true;
  }

  haveReservedPieces(color: Color): boolean {
    return this.players[color].reservedPieces > 0;
  }

  snapshot(): Stack[][] {
    return this.board.map((r) => [...r]);
  }
}

const SPACING = 1;
const OFFSET = (6 - 1) / 2;

const turnInfoElement = document.getElementById("turn-info");
if (!turnInfoElement) throw new Error("Element #turn-info not found");

const reserveInfoRedElement = document.getElementById("reserve-info-red");
if (!reserveInfoRedElement)
  throw new Error("Element #reserve-info-red not found");

const reserveInfoGreenElement = document.getElementById("reserve-info-green");
if (!reserveInfoGreenElement)
  throw new Error("Element #reserve-info-green not found");

export class BoardObject {
  private scene: THREE.Scene;
  private stacksMeshes: StackMesh[][];
  private boardMesh: BoardPieceMesh[][];
  private selectedStackKey: string | null = null;
  private selectedOutlinePass: OutlinePass;
  private intersectedOutlinePass: OutlinePass;
  private targetOutlinePass: OutlinePass;
  private ghostMesh: THREE.Mesh | null = null;
  private turn: Color = "red";
  private players: Record<Color, Player> = {
    red: { color: "red", capturedPieces: 0, reservedPieces: 2 },
    green: { color: "green", capturedPieces: 0, reservedPieces: 2 },
  };

  constructor(
    scene: THREE.Scene,
    selectedOutlinePass: OutlinePass,
    intersectedOutlinePass: OutlinePass,
    targetOutlinePass: OutlinePass,
  ) {
    this.scene = scene;
    this.selectedOutlinePass = selectedOutlinePass;
    this.intersectedOutlinePass = intersectedOutlinePass;
    this.targetOutlinePass = targetOutlinePass;
    this.stacksMeshes = [];
    this.boardMesh = [];
  }

  public setBoard(stacks: ReadonlyArray<ReadonlyArray<Stack>>) {
    if (turnInfoElement)
      turnInfoElement.textContent = `Turn: ${this.turn.toUpperCase()}`;
    if (reserveInfoRedElement)
      reserveInfoRedElement.textContent = `Red: ${this.players.red.reservedPieces}`;
    if (reserveInfoGreenElement)
      reserveInfoGreenElement.textContent = `Green: ${this.players.green.reservedPieces}`;

    this.stacksMeshes = this.createStacksMeshes(stacks, SPACING, OFFSET);
    this.boardMesh = this.createBoardMeshes(stacks, SPACING, OFFSET);
    this.setupScene(this.scene);
  }

  private setupScene(scene: THREE.Scene) {
    scene.add(
      ...this.stacksMeshes.flat().filter((m): m is THREE.Mesh => m !== null),
    );
    scene.add(
      ...this.boardMesh.flat().filter((m): m is THREE.Mesh => m !== null),
    );
  }

  public intersectStack(obj: THREE.Object3D) {
    // if the object is not a stack mesh, don't outline it
    if (this.isStackMesh(obj)) {
      this.intersectedOutlinePass.selectedObjects = [obj];
    } else {
      this.intersectedOutlinePass.selectedObjects = [];
    }
  }

  public unintersectStack() {
    this.intersectedOutlinePass.selectedObjects = [];
  }

  public selectStack(obj: THREE.Object3D) {
    const { row, col } = obj.userData;
    const key = row + ":" + col;

    // if the same stack is selected, unselect it or play reserve if possible
    if (this.selectedStackKey === key && this.isStackMesh(obj)) {
      // if (this.boardState.haveReservedPieces(this.boardState.getTurn())) {
      if (this.players[this.turn].reservedPieces > 0) {
        // TODO: Replace this function with the controller function that plays the reserve piece and updates the board state
        // const played = applyAction(action: Action);
        // if (played) {
        //   this.unselectStack();
        //   this.updateMeshes();
        // }
      } else {
        this.unselectStack();
      }
      return;
    }

    // if there are target objects, only allow selecting from those
    if (this.targetOutlinePass.selectedObjects.length > 0) {
      if (this.targetOutlinePass.selectedObjects.includes(obj)) {
        if (!this.selectedStackKey) return;

        // TODO: Replace this function with the controller function that plays the move action and updates the board state
        // const played = this.boardState.playMove(
        //   Number(this.selectedStackKey?.split(":")[0]),
        //   Number(this.selectedStackKey?.split(":")[1]),
        //   row,
        //   col,
        // );

        // if (played) {
        //   this.unselectStack();
        //   this.updateMeshes();
        // }
      } else {
        this.unselectStack();
        return;
      }
    }

    if (!this.isStackMesh(obj)) {
      this.unselectStack();
      return;
    }

    this.selectedStackKey = key;
    this.selectedOutlinePass.selectedObjects = [obj];

    if (this.isStackMovable(row, col)) {
      this.updateTargetOutlineForMoves(row, col);
    }

    if (this.players[this.turn].reservedPieces > 0) {
      this.showGhostPiece(row, col);
    }
  }

  public unselectStack() {
    this.selectedStackKey = null;
    this.selectedOutlinePass.selectedObjects = [];
    this.targetOutlinePass.selectedObjects = [];
    this.hideGhostPiece();
  }

  public isStackMesh(obj: THREE.Object3D): obj is THREE.Mesh {
    const d = (obj as THREE.Mesh).userData as Partial<StackUserData>;
    return (
      obj instanceof THREE.Mesh &&
      d.kind === "stack" &&
      typeof d.row === "number" &&
      typeof d.col === "number" &&
      typeof d.level === "number"
    );
  }

  public isBoardMesh(obj: THREE.Object3D): obj is THREE.Mesh {
    const d = (obj as THREE.Mesh).userData as Partial<BoardPieceUserData>;
    return (
      obj instanceof THREE.Mesh &&
      d.kind === "board" &&
      typeof d.row === "number" &&
      typeof d.col === "number"
    );
  }

  public getStack(row: number, col: number): StackMesh {
    return this.stacksMeshes[row]?.[col] ?? null;
  }

  private updateTargetOutlineForMoves(row: number, col: number) {
    const moves = this.possibleMoves(row, col);
    const targets: THREE.Object3D[] = [];

    for (const move of moves) {
      const stackMesh = this.stacksMeshes[move.toRow]?.[move.toCol] ?? null;
      if (stackMesh) {
        targets.push(stackMesh);
        continue;
      }

      const boardCellMesh = this.boardMesh[move.toRow]?.[move.toCol] ?? null;
      if (boardCellMesh) {
        targets.push(boardCellMesh);
      }
    }

    this.targetOutlinePass.selectedObjects = targets;
  }

  private createStacksMeshes(
    stack: ReadonlyArray<ReadonlyArray<Stack>>,
    spacing: number,
    offset: number,
  ): StackMesh[][] {
    return stack.map((row, rowIndex) =>
      row.map((cell, colIndex): StackMesh => {
        if (cell === null || cell.length === 0) return null;

        const geometries = cell.map((stack, stackIndex) => {
          const g = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32);
          g.translate(
            (colIndex - offset) * spacing,
            0.15 + stackIndex * 0.22,
            (rowIndex - offset) * spacing,
          );
          return g;
        });

        const merged = mergeGeometries(geometries, true);
        geometries.forEach((g) => g.dispose());
        if (!merged) return null;

        const materials = cell.map(
          (piece) =>
            new THREE.MeshStandardMaterial({
              color: piece.color === "red" ? 0xff3b30 : 0x34c759,
            }),
        );

        const mesh = new THREE.Mesh(merged, materials);

        mesh.userData = {
          ...mesh.userData,
          kind: "stack",
          row: rowIndex,
          col: colIndex,
          level: cell.length,
        };

        return mesh;
      }),
    );
  }

  private createBoardMeshes(
    stack: ReadonlyArray<ReadonlyArray<Stack>>,
    spacing: number,
    offset: number,
  ): BoardPieceMesh[][] {
    return stack.map((row, rowIndex) =>
      row.map((cell, colIndex): BoardPieceMesh => {
        if (cell === null) return null;

        const isEven = (rowIndex + colIndex) % 2 === 0;
        const color = isEven ? 0x1e293b : 0x334155;

        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.05, 0.9),
          new THREE.MeshStandardMaterial({ color }),
        );

        mesh.position.set(
          (colIndex - offset) * spacing,
          0,
          (rowIndex - offset) * spacing,
        );

        mesh.userData = {
          ...mesh.userData,
          kind: "board",
          row: rowIndex,
          col: colIndex,
        };
        return mesh;
      }),
    );
  }

  private possibleMoves(row: number, col: number): Move[] {
    const stackMesh = this.getStack(row, col);
    if (!stackMesh) return [];

    const stackLength = Number(stackMesh.userData.level ?? 0);
    if (stackLength <= 0) return [];

    const moves: Move[] = [];
    const directions = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    for (const { dr, dc } of directions) {
      const newRow = row + dr * stackLength;
      const newCol = col + dc * stackLength;

      if (
        newRow < 0 ||
        newRow >= TAMANHO_TABULEIRO ||
        newCol < 0 ||
        newCol >= TAMANHO_TABULEIRO
      ) {
        continue;
      }

      moves.push({ toRow: newRow, toCol: newCol });
    }

    return moves;
  }

  private showGhostPiece(row: number, col: number) {
    this.hideGhostPiece();

    const stackMesh = this.getStack(row, col);
    if (!stackMesh) return;

    const stackLength = stackMesh.userData.level;
    const color = this.turn === "red" ? 0xff3b30 : 0x34c759;

    this.ghostMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32),
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.4,
      }),
    );

    this.ghostMesh.position.set(
      (col - OFFSET) * SPACING,
      0.15 + stackLength * 0.22,
      (row - OFFSET) * SPACING,
    );

    // prevents the ghost mesh from being detected by raycaster
    this.ghostMesh.raycast = () => {};
    this.scene.add(this.ghostMesh);
  }

  private hideGhostPiece() {
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh.geometry.dispose();
      (this.ghostMesh.material as THREE.MeshStandardMaterial).dispose();
      this.ghostMesh = null;
    }
  }

  private isStackMovable(row: number, col: number): boolean {
    const stackMesh = this.getStack(row, col);
    if (!stackMesh) return false;

    const level = Number(stackMesh.userData.level ?? 0);
    if (level <= 0) return false;

    const mats = Array.isArray(stackMesh.material)
      ? stackMesh.material
      : [stackMesh.material];

    const topMat = mats[level - 1] as THREE.MeshStandardMaterial | undefined;
    const topColor = topMat?.color;
    const topHex = topColor?.getHex();

    const topName =
      topHex === 0xff3b30 ? "red" : topHex === 0x34c759 ? "green" : "unknown";

    if (topName !== this.turn) return false;

    return true;
  }
}
