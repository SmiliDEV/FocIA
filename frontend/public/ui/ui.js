import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
export const MAX_JOGADAS = 250;
export const MAX_ALTURA_PILHA = 3;
export const TAMANHO_TABULEIRO = 6;
const p = (color) => ({ color });
const initialBoard = [
    [null, null, [], [], null, null],
    [null, [p("green")], [p("green")], [p("red")], [p("red")], null],
    [[], [p("red")], [p("red")], [p("green")], [p("green")], []],
    [[], [p("green")], [p("green")], [p("red")], [p("red")], []],
    [null, [p("red")], [p("red")], [p("green")], [p("green")], null],
    [null, null, [], [], null, null],
];
const testBoard = [
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
    turn = "red";
    players = {
        red: { color: "red", capturedPieces: 0, reservedPieces: 2 },
        green: { color: "green", capturedPieces: 0, reservedPieces: 2 },
    };
    _board;
    constructor() {
        this._board = testBoard.map((r) => [...r]);
    }
    get board() {
        return this._board;
    }
    getTurn() {
        return this.turn;
    }
    getStack(row, col) {
        return this.board[row]?.[col] ?? null;
    }
    move(fromRow, fromCol, toRow, toCol) {
        const stack = this.getStack(fromRow, fromCol);
        return true;
    }
    possibleMoves(row, col) {
        if (!this.getStack(row, col) || this.getStack(row, col)?.length === 0)
            return [];
        const moves = [];
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
            if (newRow < 0 ||
                newRow >= this.board.length ||
                newCol < 0 ||
                newCol >= this.board[0].length ||
                this.getStack(newRow, newCol) === null)
                continue;
            moves.push({ toRow: newRow, toCol: newCol });
        }
        return moves;
    }
    playMove(fromRow, fromCol, toRow, toCol) {
        const stack = this.getStack(fromRow, fromCol);
        if (!stack || stack.length === 0)
            return false;
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
    playReserve(toRow, toCol) {
        if (!this.haveReservedPieces(this.turn))
            return false;
        if (this.getStack(toRow, toCol) === null)
            return false;
        this._board[toRow][toCol] = [
            ...(this.getStack(toRow, toCol) ?? []),
            { color: this.turn },
        ];
        this.players[this.turn].reservedPieces--;
        this.turn = this.turn === "red" ? "green" : "red";
        return true;
    }
    isStackMovable(row, col) {
        const stack = this.getStack(row, col);
        if (stack?.length === 0 || stack === null)
            return false;
        if (stack[stack.length - 1].color !== this.turn)
            return false;
        //if (this.possibleMoves(row, col).length === 0) return false;
        return true;
    }
    haveReservedPieces(color) {
        return this.players[color].reservedPieces > 0;
    }
    snapshot() {
        return this.board.map((r) => [...r]);
    }
}
const SPACING = 1;
const OFFSET = (6 - 1) / 2;
const turnInfoElement = document.getElementById("turn-info");
if (!turnInfoElement)
    throw new Error("Element #turn-info not found");
const reserveInfoRedElement = document.getElementById("reserve-info-red");
if (!reserveInfoRedElement)
    throw new Error("Element #reserve-info-red not found");
const reserveInfoGreenElement = document.getElementById("reserve-info-green");
if (!reserveInfoGreenElement)
    throw new Error("Element #reserve-info-green not found");
export class BoardObject {
    scene;
    stacksMeshes;
    boardMesh;
    selectedStackKey = null;
    selectedOutlinePass;
    intersectedOutlinePass;
    targetOutlinePass;
    ghostMesh = null;
    turn = "red";
    players = {
        red: { color: "red", capturedPieces: 0, reservedPieces: 2 },
        green: { color: "green", capturedPieces: 0, reservedPieces: 2 },
    };
    constructor(scene, selectedOutlinePass, intersectedOutlinePass, targetOutlinePass) {
        this.scene = scene;
        this.selectedOutlinePass = selectedOutlinePass;
        this.intersectedOutlinePass = intersectedOutlinePass;
        this.targetOutlinePass = targetOutlinePass;
        this.stacksMeshes = [];
        this.boardMesh = [];
    }
    setBoard(stacks) {
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
    setupScene(scene) {
        scene.add(...this.stacksMeshes.flat().filter((m) => m !== null));
        scene.add(...this.boardMesh.flat().filter((m) => m !== null));
    }
    intersectStack(obj) {
        // if the object is not a stack mesh, don't outline it
        if (this.isStackMesh(obj)) {
            this.intersectedOutlinePass.selectedObjects = [obj];
        }
        else {
            this.intersectedOutlinePass.selectedObjects = [];
        }
    }
    unintersectStack() {
        this.intersectedOutlinePass.selectedObjects = [];
    }
    selectStack(obj) {
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
            }
            else {
                this.unselectStack();
            }
            return;
        }
        // if there are target objects, only allow selecting from those
        if (this.targetOutlinePass.selectedObjects.length > 0) {
            if (this.targetOutlinePass.selectedObjects.includes(obj)) {
                if (!this.selectedStackKey)
                    return;
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
            }
            else {
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
    unselectStack() {
        this.selectedStackKey = null;
        this.selectedOutlinePass.selectedObjects = [];
        this.targetOutlinePass.selectedObjects = [];
        this.hideGhostPiece();
    }
    isStackMesh(obj) {
        const d = obj.userData;
        return (obj instanceof THREE.Mesh &&
            d.kind === "stack" &&
            typeof d.row === "number" &&
            typeof d.col === "number" &&
            typeof d.level === "number");
    }
    isBoardMesh(obj) {
        const d = obj.userData;
        return (obj instanceof THREE.Mesh &&
            d.kind === "board" &&
            typeof d.row === "number" &&
            typeof d.col === "number");
    }
    getStack(row, col) {
        return this.stacksMeshes[row]?.[col] ?? null;
    }
    updateTargetOutlineForMoves(row, col) {
        const moves = this.possibleMoves(row, col);
        const targets = [];
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
    createStacksMeshes(stack, spacing, offset) {
        return stack.map((row, rowIndex) => row.map((cell, colIndex) => {
            if (cell === null || cell.length === 0)
                return null;
            const geometries = cell.map((stack, stackIndex) => {
                const g = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32);
                g.translate((colIndex - offset) * spacing, 0.15 + stackIndex * 0.22, (rowIndex - offset) * spacing);
                return g;
            });
            const merged = mergeGeometries(geometries, true);
            geometries.forEach((g) => g.dispose());
            if (!merged)
                return null;
            const materials = cell.map((piece) => new THREE.MeshStandardMaterial({
                color: piece.color === "red" ? 0xff3b30 : 0x34c759,
            }));
            const mesh = new THREE.Mesh(merged, materials);
            mesh.userData = {
                ...mesh.userData,
                kind: "stack",
                row: rowIndex,
                col: colIndex,
                level: cell.length,
            };
            return mesh;
        }));
    }
    createBoardMeshes(stack, spacing, offset) {
        return stack.map((row, rowIndex) => row.map((cell, colIndex) => {
            if (cell === null)
                return null;
            const isEven = (rowIndex + colIndex) % 2 === 0;
            const color = isEven ? 0x1e293b : 0x334155;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), new THREE.MeshStandardMaterial({ color }));
            mesh.position.set((colIndex - offset) * spacing, 0, (rowIndex - offset) * spacing);
            mesh.userData = {
                ...mesh.userData,
                kind: "board",
                row: rowIndex,
                col: colIndex,
            };
            return mesh;
        }));
    }
    possibleMoves(row, col) {
        const stackMesh = this.getStack(row, col);
        if (!stackMesh)
            return [];
        const stackLength = Number(stackMesh.userData.level ?? 0);
        if (stackLength <= 0)
            return [];
        const moves = [];
        const directions = [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
        ];
        for (const { dr, dc } of directions) {
            const newRow = row + dr * stackLength;
            const newCol = col + dc * stackLength;
            if (newRow < 0 ||
                newRow >= TAMANHO_TABULEIRO ||
                newCol < 0 ||
                newCol >= TAMANHO_TABULEIRO) {
                continue;
            }
            moves.push({ toRow: newRow, toCol: newCol });
        }
        return moves;
    }
    showGhostPiece(row, col) {
        this.hideGhostPiece();
        const stackMesh = this.getStack(row, col);
        if (!stackMesh)
            return;
        const stackLength = stackMesh.userData.level;
        const color = this.turn === "red" ? 0xff3b30 : 0x34c759;
        this.ghostMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32), new THREE.MeshStandardMaterial({
            color,
            transparent: true,
            opacity: 0.4,
        }));
        this.ghostMesh.position.set((col - OFFSET) * SPACING, 0.15 + stackLength * 0.22, (row - OFFSET) * SPACING);
        // prevents the ghost mesh from being detected by raycaster
        this.ghostMesh.raycast = () => { };
        this.scene.add(this.ghostMesh);
    }
    hideGhostPiece() {
        if (this.ghostMesh) {
            this.scene.remove(this.ghostMesh);
            this.ghostMesh.geometry.dispose();
            this.ghostMesh.material.dispose();
            this.ghostMesh = null;
        }
    }
    isStackMovable(row, col) {
        const stackMesh = this.getStack(row, col);
        if (!stackMesh)
            return false;
        const level = Number(stackMesh.userData.level ?? 0);
        if (level <= 0)
            return false;
        const mats = Array.isArray(stackMesh.material)
            ? stackMesh.material
            : [stackMesh.material];
        const topMat = mats[level - 1];
        const topColor = topMat?.color;
        const topHex = topColor?.getHex();
        const topName = topHex === 0xff3b30 ? "red" : topHex === 0x34c759 ? "green" : "unknown";
        if (topName !== this.turn)
            return false;
        return true;
    }
}
//# sourceMappingURL=ui.js.map