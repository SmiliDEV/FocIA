import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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
export class BoardObject {
    boardState;
    scene;
    stackMeshes;
    boardMesh;
    selectedStackKey = null;
    selectedOutlinePass;
    intersectedOutlinePass;
    targetOutlinePass;
    ghostMesh = null;
    constructor(boardState, scene, selectedOutlinePass, intersectedOutlinePass, targetOutlinePass) {
        this.boardState = boardState;
        this.scene = scene;
        this.selectedOutlinePass = selectedOutlinePass;
        this.intersectedOutlinePass = intersectedOutlinePass;
        this.targetOutlinePass = targetOutlinePass;
        const spacing = 1;
        const offset = (6 - 1) / 2;
        this.stackMeshes = this.createStackMeshes(boardState.board, spacing, offset);
        this.boardMesh = this.createBoardMeshes(boardState.board, spacing, offset);
        this.setupScene(scene);
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
            if (this.boardState.haveReservedPieces(this.boardState.getTurn())) {
                const played = this.boardState.playReserve(row, col);
                if (played) {
                    this.unselectStack();
                    this.updateMeshes();
                }
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
                const played = this.boardState.playMove(Number(this.selectedStackKey?.split(":")[0]), Number(this.selectedStackKey?.split(":")[1]), row, col);
                if (played) {
                    this.unselectStack();
                    this.updateMeshes();
                }
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
        if (this.boardState.isStackMovable(row, col)) {
            this.updateTargetOutlineForMoves(row, col);
        }
        if (this.boardState.haveReservedPieces(this.boardState.getTurn())) {
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
    updateTargetOutlineForMoves(row, col) {
        const moves = this.boardState.possibleMoves(row, col);
        const targets = [];
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
    createStackMeshes(stack, spacing, offset) {
        return stack.map((row, rowIndex) => row.map((cell, colIndex) => {
            if (cell === null || cell.length === 0)
                return null;
            const geometries = cell.map((stack, stackIndex) => {
                const g = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32);
                g.translate((colIndex - offset) * spacing, 0.15 + stackIndex * 0.22, (rowIndex - offset) * spacing);
                return g;
            });
            const merged = mergeGeometries(geometries, false);
            geometries.forEach((g) => g.dispose());
            if (!merged)
                return null;
            const topPiece = cell[cell.length - 1];
            const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
                color: topPiece.color === "red" ? 0xff3b30 : 0x34c759,
            }));
            mesh.userData = {
                ...mesh.userData,
                kind: "stack",
                row: rowIndex,
                col: colIndex,
                level: cell.length - 1,
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
    setupScene(scene) {
        scene.add(...this.stackMeshes.flat().filter((m) => m !== null));
        scene.add(...this.boardMesh.flat().filter((m) => m !== null));
    }
    updateMeshes() {
        for (let row = 0; row < this.boardState.board.length; row++) {
            for (let col = 0; col < this.boardState.board[row].length; col++) {
                const stack = this.boardState.getStack(row, col);
                const existingMesh = this.stackMeshes[row][col];
                if ((!stack || stack.length === 0) && existingMesh) {
                    this.scene.remove(existingMesh);
                    this.stackMeshes[row][col] = null;
                }
                else if (stack && stack.length > 0) {
                    const geometries = stack.map((stack, stackIndex) => {
                        const g = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32);
                        g.translate((col - 2.5) * 1, 0.15 + stackIndex * 0.22, (row - 2.5) * 1);
                        return g;
                    });
                    const merged = mergeGeometries(geometries, false);
                    geometries.forEach((g) => g.dispose());
                    if (!merged)
                        return;
                    if (existingMesh) {
                        existingMesh.geometry.dispose();
                        existingMesh.geometry = merged;
                        existingMesh.material = new THREE.MeshStandardMaterial({
                            color: stack[stack.length - 1].color === "red" ? 0xff3b30 : 0x34c759,
                        });
                        existingMesh.userData.level = stack.length - 1;
                    }
                    else {
                        const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
                            color: stack[stack.length - 1].color === "red" ? 0xff3b30 : 0x34c759,
                        }));
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
    showGhostPiece(row, col) {
        this.hideGhostPiece();
        const spacing = 1;
        const offset = (6 - 1) / 2;
        const stack = this.boardState.getStack(row, col);
        const stackLength = stack?.length ?? 0;
        const color = this.boardState.getTurn() === "red" ? 0xff3b30 : 0x34c759;
        this.ghostMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.4 }));
        this.ghostMesh.position.set((col - offset) * spacing, 0.15 + stackLength * 0.22, (row - offset) * spacing);
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
}
//# sourceMappingURL=ui.js.map