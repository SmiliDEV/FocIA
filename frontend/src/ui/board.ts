import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  Coords,
  FocusBoardConfig,
  FocusStateDTO,
  PlayerColor,
} from "@shared-types";
import { stack } from "three/tsl";

///////////////////////////////////////////////////////////////////////////////////////////////////
// Configs

export const MAX_JOGADAS = 250;
export const MAX_ALTURA_PILHA = 3;
export const TAMANHO_TABULEIRO = 6;

const SPACING = 1;
const OFFSET = (6 - 1) / 2;

///////////////////////////////////////////////////////////////////////////////////////////////////
// Types

export interface Player {
  color: PlayerColor;
  capturedPieces: number;
  reservedPieces: number;
}

export interface MeshPiece {
  mesh: THREE.Mesh;
}

export interface Piece {
  color: PlayerColor;
}

export type Stack = Piece[] | null;

export type StackMesh = THREE.Mesh | null;

export type BoardPieceMesh = THREE.Mesh | null;

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

export type PossibleMoves = {
  toRow: number;
  toCol: number;
};

export type Move = {
  sourcePos: Coords;
  destPos: Coords;
};

export type Reserve = {
  destPos: Coords;
};

type AttackAnimation = {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromCoords: Coords;
  toCoords: Coords;
  elapsed: number;
  duration: number;
  arcHeight: number;
};

type ReserveAnimation = {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  targetCoords: Coords;
  color: PlayerColor;
  elapsed: number;
  duration: number;
};

///////////////////////////////////////////////////////////////////////////////////////////////////
// UI

const turnInfoElement = document.getElementById("turn-info");
if (!turnInfoElement) throw new Error("Element #turn-info not found");

const reserveInfoRedElement = document.getElementById("reserve-info-red");
if (!reserveInfoRedElement)
  throw new Error("Element #reserve-info-red not found");

const reserveInfoGreenElement = document.getElementById("reserve-info-green");
if (!reserveInfoGreenElement)
  throw new Error("Element #reserve-info-green not found");

const infoBoardElement = document.getElementById("info-board");
if (!infoBoardElement) throw new Error("Element #info-board not found");

///////////////////////////////////////////////////////////////////////////////////////////////////
// BoardObject

export class BoardObject {
  private boardSize: number = TAMANHO_TABULEIRO;
  private maxStackHeight: number = MAX_ALTURA_PILHA;
  private maxPlays: number = MAX_JOGADAS;

  private scene: THREE.Scene;
  private stacksMeshes: StackMesh[][];
  private boardMesh: BoardPieceMesh[][];
  private ghostMesh: THREE.Mesh | null = null;

  // selection
  private selectedStackCoords: Coords | null = null;

  // outline passes
  private selectedOutlinePass: OutlinePass;
  private intersectedOutlinePass: OutlinePass;
  private targetOutlinePass: OutlinePass;

  // game state
  private turn: PlayerColor = "RED";
  private players: Record<PlayerColor, Player> = {
    RED: { color: "RED", capturedPieces: 0, reservedPieces: 2 },
    GREEN: { color: "GREEN", capturedPieces: 0, reservedPieces: 2 },
  };

  // animation
  private attackAnimation: AttackAnimation | null = null;
  private reserveAnimation: ReserveAnimation | null = null;

  // destiny position used by animation to know where the stack is going to,
  // so it can correctly merge stacks at the end of the animation
  private destPos: Coords | null = null;

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

  public update(deltaSec: number) {
    this.updateAttackAnimation(deltaSec);
    this.updateReserveAnimation(deltaSec);
  }

  public setBoardConfig(config: FocusBoardConfig, state: FocusStateDTO) {
    this.boardSize = config.size;
    this.maxStackHeight = config.maxStackHeight;
    this.maxPlays = config.maxPlays;

    this.turn = state.to_move;
    this.players.RED.reservedPieces = state.reserve.RED;
    this.players.GREEN.reservedPieces = state.reserve.GREEN;
    this.players.RED.capturedPieces = state.captured.RED;
    this.players.GREEN.capturedPieces = state.captured.GREEN;

    const stacks = this.toStacksMatrix(state.board);
    this.stacksMeshes = this.createStacksMeshes(stacks);
    this.boardMesh = this.createBoardMeshes(stacks);
    this.setupScene(this.scene);

    // update the html
    if (turnInfoElement) turnInfoElement.textContent = `Turn: ${this.turn}`;
    if (reserveInfoRedElement)
      reserveInfoRedElement.textContent = `Red: ${this.players.RED.reservedPieces}`;
    if (reserveInfoGreenElement)
      reserveInfoGreenElement.textContent = `Green: ${this.players.GREEN.reservedPieces}`;

    if (infoBoardElement) {
      infoBoardElement.textContent = `Board size: ${this.boardSize}x${this.boardSize}, Max stack height: ${this.maxStackHeight}, Max plays: ${this.maxPlays}`;
    }
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

  public isReservePlay(obj: THREE.Object3D): Reserve | null {
    // if there is an animation ongoing, ignore any selection
    if (this.attackAnimation || this.reserveAnimation) return null;

    const stackUserData: StackUserData = obj.userData as StackUserData;
    const stackCoords: Coords = { y: stackUserData.row, x: stackUserData.col };

		if (!this.selectedStackCoords)
			return null;

		// if the selected stack is the same as the clicked stack and it's a stack mesh, it's a reserve play
    if (this.selectedStackCoords.x === stackCoords.x && this.selectedStackCoords.y === stackCoords.y && this.isStackMesh(obj)) {

      if (this.players[this.turn].reservedPieces > 0) {
        this.unselectStack();

        return { destPos: stackCoords };
      } else {
        this.unselectStack();
      }
    }

    return null;
  }

  public isMovePlaying(obj: THREE.Object3D): Move | null {
    // if there is an animation ongoing, ignore any selection
    if (this.attackAnimation || this.reserveAnimation) return null;

    if (this.targetOutlinePass.selectedObjects.length > 0) {
      if (this.targetOutlinePass.selectedObjects.includes(obj)) {
        if (!this.selectedStackCoords) return null;

        const stackUserData: StackUserData = obj.userData as StackUserData;
        const stackCoords: Coords = {
          y: stackUserData.row,
          x: stackUserData.col,
        };

        const sourcePos = this.selectedStackCoords;
        const destPos = stackCoords;

        this.unselectStack();

        return { sourcePos, destPos };
      } else {
        this.unselectStack();
      }
    }

    return null;
  }

  public selectStack(obj: THREE.Object3D) {
    // if there is an animation ongoing, ignore any selection
    if (this.attackAnimation || this.reserveAnimation) return;

    const stackUserData: StackUserData = obj.userData as StackUserData;
    const stackCoords: Coords = { y: stackUserData.row, x: stackUserData.col };

    // if the object is not a stack mesh, unselect any selected stack and return
    if (!this.isStackMesh(obj)) {
      this.unselectStack();
      return;
    }

    this.selectedStackCoords = stackCoords;
    this.selectedOutlinePass.selectedObjects = [obj];

    // if the stack is movable, show the possible moves in the target outline pass
    if (this.isStackMovable(stackCoords.y, stackCoords.x)) {
      this.updateTargetOutlineForMoves(stackCoords.y, stackCoords.x);
    }

    // if the current player has reserved pieces, show the ghost piece in the stack
    if (this.players[this.turn].reservedPieces > 0) {
      this.showGhostPiece(stackCoords.y, stackCoords.x);
    }
  }

  public unselectStack() {
    this.selectedStackCoords = null;
    this.selectedOutlinePass.selectedObjects = [];
    this.targetOutlinePass.selectedObjects = [];
    this.hideGhostPiece();
  }

  public animateMove(
    sourcePos: Coords,
    destPos: Coords,
    finalDestStack: Stack,
  ) {
    // if there is an animation ongoing, ignore any new move
    if (this.attackAnimation || this.reserveAnimation) return;

    // remove the source stack
    this.removeStackMesh(sourcePos.y, sourcePos.x);
    this.startAttackAnimation(sourcePos, destPos);
    this.destPos = destPos; // animation needs to know the destination position to correctly merge stacks at the end of the animation
  }

  public animateReservePlace(
    player: PlayerColor,
    destPos: Coords,
    finalDestStack: Stack,
  ) {
    // if there is an animation ongoing, ignore any new move
    if (this.attackAnimation || this.reserveAnimation) return;

    this.startReserveAnimation(destPos.y, destPos.x, player);
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////
  // Stack

  private mergeAndTrimStacks(fromCoords: Coords, toCoords: Coords) {
    const sourceStack = this.getStack(fromCoords.y, fromCoords.x);
    const destinationStack = this.getStack(toCoords.y, toCoords.x);

    const merged = [
      ...this.stackMeshToPieces(destinationStack),
      ...this.stackMeshToPieces(sourceStack),
    ];
    const overflow = Math.max(0, merged.length - MAX_ALTURA_PILHA);
    const trimmed = merged.slice(overflow);

    this.removeStackMesh(toCoords.y, toCoords.x);

    const rebuilt = this.createStackMesh(trimmed, toCoords.y, toCoords.x);
    this.stacksMeshes[toCoords.y][toCoords.x] = rebuilt;
    if (rebuilt) {
      this.scene.add(rebuilt);
    }
  }

  private applyReservePieceAndTrim(
    row: number,
    col: number,
    color: PlayerColor,
  ) {
    const destinationStack = this.getStack(row, col);
    const merged = [...this.stackMeshToPieces(destinationStack), { color }];
    const overflow = Math.max(0, merged.length - MAX_ALTURA_PILHA);
    const trimmed = merged.slice(overflow);

    this.removeStackMesh(row, col);

    const rebuilt = this.createStackMesh(trimmed, row, col);
    this.stacksMeshes[row][col] = rebuilt;
    if (rebuilt) {
      this.scene.add(rebuilt);
    }
  }

  private stackMeshToPieces(mesh: StackMesh): Piece[] {
    if (!mesh) return [];
    const stackMats = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    return stackMats
      .map((material) => {
        const mat = material as THREE.MeshStandardMaterial;
        const colorHex = mat.color?.getHex();
        if (colorHex === 0xff3b30) return { color: "RED" as const };
        if (colorHex === 0x34c759) return { color: "GREEN" as const };
        return null;
      })
      .filter((piece): piece is Piece => piece !== null);
  }

  private createStackMesh(stack: Piece[], row: number, col: number): StackMesh {
    if (stack === null || stack.length === 0) return null;

    const geometries = stack.map((stack, stackIndex) => {
      const g = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32);
      g.translate(
        (col - OFFSET) * SPACING,
        0.15 + stackIndex * 0.22,
        (row - OFFSET) * SPACING,
      );
      return g;
    });

    const merged = mergeGeometries(geometries, true);
    geometries.forEach((g) => g.dispose());
    if (!merged) return null;

    const materials = stack.map(
      (piece) =>
        new THREE.MeshStandardMaterial({
          color: piece.color === "RED" ? 0xff3b30 : 0x34c759,
        }),
    );

    const mesh = new THREE.Mesh(merged, materials);

    mesh.userData = {
      ...mesh.userData,
      kind: "stack",
      row: row,
      col: col,
      level: stack.length,
    };

    return mesh;
  }

  private removeStackMesh(row: number, col: number) {
    const sourceStackMesh = this.getStack(row, col);

    if (sourceStackMesh) {
      this.scene.remove(sourceStackMesh);
      sourceStackMesh.geometry.dispose();
      const mats = Array.isArray(sourceStackMesh.material)
        ? sourceStackMesh.material
        : [sourceStackMesh.material];
      mats.forEach((m) => m.dispose());
    }
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

  public getStack(row: number, col: number): StackMesh {
    return this.stacksMeshes[row]?.[col] ?? null;
  }

  private createStacksMeshes(
    stacks: ReadonlyArray<ReadonlyArray<Stack>>,
  ): StackMesh[][] {
    return stacks.map((row, rowIndex) =>
      row.map((cell, colIndex): StackMesh => {
        return this.createStackMesh(cell ?? [], rowIndex, colIndex);
      }),
    );
  }

  private toStacksMatrix(boardEntries: FocusStateDTO["board"]): Stack[][] {
    const stacks: Stack[][] = Array.from({ length: this.boardSize }, () =>
      Array.from({ length: this.boardSize }, () => null),
    );

    for (const [posKey, pieces] of boardEntries) {
      const [x, y] = posKey.split(",").map(Number);
      if (
        Number.isNaN(x) ||
        Number.isNaN(y) ||
        x < 0 ||
        x >= this.boardSize ||
        y < 0 ||
        y >= this.boardSize
      ) {
        continue;
      }

      const stackPieces: Piece[] = pieces
        .filter(
          (piece): piece is PlayerColor => piece === "RED" || piece === "GREEN",
        )
        .map((color) => ({ color }));

      stacks[y][x] = stackPieces;
    }

    return stacks;
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////
  // Board

  public isBoardMesh(obj: THREE.Object3D): obj is THREE.Mesh {
    const d = (obj as THREE.Mesh).userData as Partial<BoardPieceUserData>;
    return (
      obj instanceof THREE.Mesh &&
      d.kind === "board" &&
      typeof d.row === "number" &&
      typeof d.col === "number"
    );
  }

  private createBoardMeshes(
    stack: ReadonlyArray<ReadonlyArray<Stack>>,
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
          (colIndex - OFFSET) * SPACING,
          0,
          (rowIndex - OFFSET) * SPACING,
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

  ///////////////////////////////////////////////////////////////////////////////////////////////////
  // Util

  private setupScene(scene: THREE.Scene) {
    scene.add(
      ...this.stacksMeshes.flat().filter((m): m is THREE.Mesh => m !== null),
    );
    scene.add(
      ...this.boardMesh.flat().filter((m): m is THREE.Mesh => m !== null),
    );
  }

  private possibleMoves(row: number, col: number): PossibleMoves[] {
    const stackMesh = this.getStack(row, col);
    if (!stackMesh) return [];

    const stackLength = Number(stackMesh.userData.level ?? 0);
    if (stackLength <= 0) return [];

    const moves: PossibleMoves[] = [];
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

  private isStackMovable(row: number, col: number): boolean {
    const stackMesh = this.getStack(row, col);
    if (!stackMesh) return false;

    const level = Number(stackMesh.userData.level ?? 0);
    if (level <= 0) return false;

    const mats = Array.isArray(stackMesh.material)
      ? stackMesh.material
      : [stackMesh.material];

    const topMat = mats[level - 1] as THREE.MeshStandardMaterial | undefined;
    // const topColor = topMat?.color;
    //const topHex = topColor?.getHex();

    const topColor = this.hexToPlayerColor(topMat?.color?.getHex() ?? 0);
    if (topColor !== this.turn) return false;

    return true;
  }

  private showGhostPiece(row: number, col: number) {
    this.hideGhostPiece();

    const stackMesh = this.getStack(row, col);
    if (!stackMesh) return;

    const stackLength = stackMesh.userData.level;
    const color = this.playerColorToHex(this.turn);

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

  private playerColorToHex(color: PlayerColor): number {
    return color === "RED" ? 0xff3b30 : 0x34c759;
  }

  private hexToPlayerColor(hex: number | undefined): PlayerColor | null {
    if (hex === 0xff3b30) return "RED";
    if (hex === 0x34c759) return "GREEN";
    return null;
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////
  // Animation

  private updateAttackAnimation(deltaSec: number) {
    if (!this.attackAnimation) return;

    const a = this.attackAnimation;
    a.elapsed = Math.min(a.elapsed + deltaSec, a.duration);
    const t = a.elapsed / a.duration;

    const eased = t * t * (3 - 2 * t);

    a.mesh.position.lerpVectors(a.from, a.to, eased);
    a.mesh.position.y += Math.sin(Math.PI * eased) * a.arcHeight;

    if (t >= 1) {
      this.scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      const mats = Array.isArray(a.mesh.material)
        ? a.mesh.material
        : [a.mesh.material];
      mats.forEach((m) => m.dispose());

      this.mergeAndTrimStacks(a.fromCoords, a.toCoords);
      this.stacksMeshes[a.fromCoords.y][a.fromCoords.x] = null;

      this.destPos = null;
      this.attackAnimation = null;
    }
  }

  private updateReserveAnimation(deltaSec: number) {
    if (!this.reserveAnimation) return;

    const a = this.reserveAnimation;
    a.elapsed = Math.min(a.elapsed + deltaSec, a.duration);
    const t = a.elapsed / a.duration;

    const eased = 1 - (1 - t) * (1 - t) * (1 - t);
    a.mesh.position.lerpVectors(a.from, a.to, eased);

    if (t >= 1) {
      this.scene.remove(a.mesh);
      a.mesh.geometry.dispose();
      (a.mesh.material as THREE.MeshStandardMaterial).dispose();

      this.applyReservePieceAndTrim(
        a.targetCoords.y,
        a.targetCoords.x,
        a.color,
      );

      if (this.players[a.color].reservedPieces > 0) {
        this.players[a.color].reservedPieces -= 1;
      }

      if (reserveInfoRedElement)
        reserveInfoRedElement.textContent = `Red: ${this.players.RED.reservedPieces}`;
      if (reserveInfoGreenElement)
        reserveInfoGreenElement.textContent = `Green: ${this.players.GREEN.reservedPieces}`;

      this.reserveAnimation = null;
    }
  }

  private startReserveAnimation(row: number, col: number, color: PlayerColor) {
    if (this.attackAnimation || this.reserveAnimation) return;

    const targetStack = this.getStack(row, col);
    const targetLevel = Number(targetStack?.userData.level ?? 0);
    const colorHex = this.playerColorToHex(color);

    const animated = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32),
      new THREE.MeshStandardMaterial({ color: colorHex }),
    );

    const x = (col - OFFSET) * SPACING;
    const z = (row - OFFSET) * SPACING;
    const from = new THREE.Vector3(x, 1.6, z);
    const to = new THREE.Vector3(x, 0.15 + targetLevel * 0.22, z);

    animated.position.copy(from);
    animated.raycast = () => {};
    this.scene.add(animated);

    this.reserveAnimation = {
      mesh: animated,
      from,
      to,
      targetCoords: { y: row, x: col },
      color,
      elapsed: 0,
      duration: 0.3,
    };
  }

  private startAttackAnimation(sourcePos: Coords, destPos: Coords) {
    if (this.attackAnimation) return;

    const fromRow = sourcePos.y;
    const fromCol = sourcePos.x;
    const toRow = destPos.y;
    const toCol = destPos.x;

    if (
      Number.isNaN(fromRow) ||
      Number.isNaN(fromCol) ||
      Number.isNaN(toRow) ||
      Number.isNaN(toCol)
    ) {
      return;
    }

    const sourceStack = this.getStack(fromRow, fromCol);
    if (!sourceStack) return;

    let height = 0;
    const targetStack = this.getStack(toRow, toCol);
    if (targetStack) {
      height = Number(targetStack.userData.level ?? 0);
    }

    // clone mesh so current board state can remain unchanged for now
    const animated = sourceStack.clone() as THREE.Mesh;
    animated.geometry = sourceStack.geometry.clone();

    const srcMats = Array.isArray(sourceStack.material)
      ? sourceStack.material
      : [sourceStack.material];
    animated.material = srcMats.map((m) => (m as THREE.Material).clone());

    animated.position.copy(sourceStack.position);
    animated.raycast = () => {}; // ignore clicks
    this.scene.add(animated);

    const from = animated.position.clone();
    const dx = (toCol - fromCol) * SPACING;
    const dz = (toRow - fromRow) * SPACING;
    const to = from.clone().add(new THREE.Vector3(dx, height * 0.22, dz));

    this.attackAnimation = {
      mesh: animated,
      from,
      to,
      fromCoords: sourcePos,
      toCoords: destPos,
      elapsed: 0,
      duration: 0.4,
      arcHeight: 0.35,
    };
  }

  public isAnimating() {
    return this.attackAnimation !== null || this.reserveAnimation !== null;
  }
}
