import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

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
    red: { color: "red", capturedPieces: 0, reservedPieces: 0 },
    green: { color: "green", capturedPieces: 0, reservedPieces: 0 },
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
    toCol: number
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
    toCol: number
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

export class BoardObject {
  private boardState: BoardState;
  private scene: THREE.Scene;
  private stackMeshes: StackMesh[][];
  private boardMesh: BoardPieceMesh[][];
  private selectedStackKey: string | null = null;
  private selectedOutlinePass: OutlinePass;
  private intersectedOutlinePass: OutlinePass;
  private targetOutlinePass: OutlinePass;
  private toggleReservePlay: boolean = false;

  constructor(
    boardState: BoardState,
    scene: THREE.Scene,
    selectedOutlinePass: OutlinePass,
    intersectedOutlinePass: OutlinePass,
    targetOutlinePass: OutlinePass
  ) {
    this.boardState = boardState;
    this.scene = scene;
    this.selectedOutlinePass = selectedOutlinePass;
    this.intersectedOutlinePass = intersectedOutlinePass;
    this.targetOutlinePass = targetOutlinePass;

    const spacing = 1;
    const offset = (6 - 1) / 2;
    this.stackMeshes = this.createStackMeshes(
      boardState.board,
      spacing,
      offset
    );

    this.boardMesh = this.createBoardMeshes(boardState.board, spacing, offset);
    this.setupScene(scene);
  }

  public toggleReserveMode() {
    if (!this.boardState.haveReservedPieces(this.boardState.getTurn())) return;

    this.toggleReservePlay = !this.toggleReservePlay;
    if (!this.toggleReservePlay) {
      this.targetOutlinePass.selectedObjects = [];
    }
  }

  public intersectStack(obj: THREE.Object3D) {
    // if reserve mode is toggled on and the object is a stack mesh
    if (
      this.toggleReservePlay &&
      this.isStackMesh(obj) &&
      this.isStackMesh(obj)
    ) {
      this.intersectedOutlinePass.selectedObjects = [obj];
    } else {
      this.intersectedOutlinePass.selectedObjects = [];
    }

    // if there are target objects, only outline those and ignore others
    if (this.targetOutlinePass.selectedObjects.length > 0) {
      if (this.targetOutlinePass.selectedObjects.includes(obj)) {
        this.intersectedOutlinePass.selectedObjects = [obj];
      } else {
        this.intersectedOutlinePass.selectedObjects = [];
      }
      return;
    }

    // if the object is not a stack mesh, don't outline it
    if (
      this.isStackMesh(obj) &&
      this.boardState.isStackMovable(obj.userData.row, obj.userData.col)
    ) {
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

    // if reserve mode is toggled on, play a piece from reserve to the clicked cell (if valid) and exit reserve mode
    if (this.toggleReservePlay) {
      if (this.boardState.haveReservedPieces(this.boardState.getTurn())) {
        this.boardState.playReserve(row, col);
        this.updateMeshes();
      }
      this.toggleReservePlay = false;
      this.targetOutlinePass.selectedObjects = [];
      return;
    }

    // if there are target objects, only allow selecting from those
    if (this.targetOutlinePass.selectedObjects.length > 0) {
      if (this.targetOutlinePass.selectedObjects.includes(obj)) {
        if (!this.selectedStackKey) return;

        this.boardState.playMove(
          Number(this.selectedStackKey?.split(":")[0]),
          Number(this.selectedStackKey?.split(":")[1]),
          row,
          col
        );

        this.unselectStack();
        this.updateMeshes();
      } else {
        this.unselectStack();
        return;
      }
    } else {
      if (!this.isStackMesh(obj) || !this.boardState.isStackMovable(row, col)) {
        this.unselectStack();
        return;
      }

      if (this.selectedStackKey === key) {
        this.selectedStackKey = null;
        this.selectedOutlinePass.selectedObjects = [];
        this.targetOutlinePass.selectedObjects = [];
      } else {
        this.selectedStackKey = key;
        this.selectedOutlinePass.selectedObjects = [obj];
        this.updateTargetOutlineForMoves(row, col);
      }
    }
  }

  public unselectStack() {
    this.selectedStackKey = null;
    this.selectedOutlinePass.selectedObjects = [];
    this.targetOutlinePass.selectedObjects = [];
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

  private updateTargetOutlineForMoves(row: number, col: number) {
    const moves = this.boardState.possibleMoves(row, col);
    const targets: THREE.Object3D[] = [];

    for (const move of moves) {
      const stackMesh = this.stackMeshes[move.toRow]?.[move.toCol] ?? null;
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

  private createStackMeshes(
    stack: ReadonlyArray<ReadonlyArray<Stack>>,
    spacing: number,
    offset: number
  ): StackMesh[][] {
    return stack.map((row, rowIndex) =>
      row.map((cell, colIndex): StackMesh => {
        if (cell === null || cell.length === 0) return null;

        const geometries = cell.map((stack, stackIndex) => {
          const g = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32);
          g.translate(
            (colIndex - offset) * spacing,
            0.15 + stackIndex * 0.22,
            (rowIndex - offset) * spacing
          );
          return g;
        });

        const merged = mergeGeometries(geometries, false);
        geometries.forEach((g) => g.dispose());
        if (!merged) return null;

        const topPiece = cell[cell.length - 1];
        const mesh = new THREE.Mesh(
          merged,
          new THREE.MeshStandardMaterial({
            color: topPiece.color === "red" ? 0xff3b30 : 0x34c759,
          })
        );

        mesh.userData = {
          ...mesh.userData,
          kind: "stack",
          row: rowIndex,
          col: colIndex,
          level: cell.length - 1,
        };

        return mesh;
      })
    );
  }

  private createBoardMeshes(
    stack: ReadonlyArray<ReadonlyArray<Stack>>,
    spacing: number,
    offset: number
  ): BoardPieceMesh[][] {
    return stack.map((row, rowIndex) =>
      row.map((cell, colIndex): BoardPieceMesh => {
        if (cell === null) return null;

        const isEven = (rowIndex + colIndex) % 2 === 0;
        const color = isEven ? 0x1e293b : 0x334155;

        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.05, 0.9),
          new THREE.MeshStandardMaterial({ color })
        );
        mesh.position.set(
          (colIndex - offset) * spacing,
          0,
          (rowIndex - offset) * spacing
        );
        mesh.userData = {
          ...mesh.userData,
          kind: "board",
          row: rowIndex,
          col: colIndex,
        };
        return mesh;
      })
    );
  }

  private setupScene(scene: THREE.Scene) {
    scene.add(
      ...this.stackMeshes.flat().filter((m): m is THREE.Mesh => m !== null)
    );
    scene.add(
      ...this.boardMesh.flat().filter((m): m is THREE.Mesh => m !== null)
    );
  }

  private updateMeshes() {
    for (let row = 0; row < this.boardState.board.length; row++) {
      for (let col = 0; col < this.boardState.board[row].length; col++) {
        const stack = this.boardState.getStack(row, col);
        const existingMesh = this.stackMeshes[row][col];

        if ((!stack || stack.length === 0) && existingMesh) {
          this.scene.remove(existingMesh);
          this.stackMeshes[row][col] = null;
        } else if (stack && stack.length > 0) {
          const geometries = stack.map((stack, stackIndex) => {
            const g = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32);
            g.translate(
              (col - 2.5) * 1,
              0.15 + stackIndex * 0.22,
              (row - 2.5) * 1
            );
            return g;
          });

          const merged = mergeGeometries(geometries, false);
          geometries.forEach((g) => g.dispose());
          if (!merged) return;

          if (existingMesh) {
            existingMesh.geometry.dispose();
            existingMesh.geometry = merged;
            existingMesh.material = new THREE.MeshStandardMaterial({
              color:
                stack[stack.length - 1].color === "red" ? 0xff3b30 : 0x34c759,
            });
            existingMesh.userData.level = stack.length - 1;
          } else {
            const mesh = new THREE.Mesh(
              merged,
              new THREE.MeshStandardMaterial({
                color:
                  stack[stack.length - 1].color === "red" ? 0xff3b30 : 0x34c759,
              })
            );

            mesh.userData = {
              ...mesh.userData,
              kind: "stack",
              row,
              col,
              level: stack.length - 1,
            };

            this.stackMeshes[row][col] = mesh;
            this.scene.add(mesh);
          }
        }
      }
    }
  }
}
