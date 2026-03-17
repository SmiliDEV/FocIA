import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
///////////////////////////////////////////////////////////////////////////////////////////////////
// Configs
export const MAX_JOGADAS = 250;
export const MAX_ALTURA_PILHA = 3;
export const TAMANHO_TABULEIRO = 6;
const SPACING = 1;
const OFFSET = (6 - 1) / 2;
///////////////////////////////////////////////////////////////////////////////////////////////////
// UI
const turnInfoElement = document.getElementById("turn-info");
if (!turnInfoElement)
    throw new Error("Element #turn-info not found");
const reserveInfoRedElement = document.getElementById("reserve-info-red");
if (!reserveInfoRedElement)
    throw new Error("Element #reserve-info-red not found");
const reserveInfoGreenElement = document.getElementById("reserve-info-green");
if (!reserveInfoGreenElement)
    throw new Error("Element #reserve-info-green not found");
///////////////////////////////////////////////////////////////////////////////////////////////////
// BoardObject
export class BoardObject {
    scene;
    stacksMeshes;
    boardMesh;
    ghostMesh = null;
    // selection
    selectedStackCoords = null;
    // outline passes
    selectedOutlinePass;
    intersectedOutlinePass;
    targetOutlinePass;
    // game state
    turn = "red";
    players = {
        red: { color: "red", capturedPieces: 0, reservedPieces: 2 },
        green: { color: "green", capturedPieces: 0, reservedPieces: 2 },
    };
    // animation
    attackAnimation = null;
    reserveAnimation = null;
    // destiny position
    destPos = null;
    constructor(scene, selectedOutlinePass, intersectedOutlinePass, targetOutlinePass) {
        this.scene = scene;
        this.selectedOutlinePass = selectedOutlinePass;
        this.intersectedOutlinePass = intersectedOutlinePass;
        this.targetOutlinePass = targetOutlinePass;
        this.stacksMeshes = [];
        this.boardMesh = [];
    }
    update(deltaSec) {
        this.updateAttackAnimation(deltaSec);
        this.updateReserveAnimation(deltaSec);
    }
    setBoardMesh(stacks) {
        if (turnInfoElement)
            turnInfoElement.textContent = `Turn: ${this.turn.toUpperCase()}`;
        if (reserveInfoRedElement)
            reserveInfoRedElement.textContent = `Red: ${this.players.red.reservedPieces}`;
        if (reserveInfoGreenElement)
            reserveInfoGreenElement.textContent = `Green: ${this.players.green.reservedPieces}`;
        this.stacksMeshes = this.createStacksMeshes(stacks);
        this.boardMesh = this.createBoardMeshes(stacks);
        this.setupScene(this.scene);
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
        // if there is an animation ongoing, ignore any selection
        if (this.attackAnimation || this.reserveAnimation)
            return;
        const stackUserData = obj.userData;
        const stackCoords = stackUserData;
        // if the same stack is selected, unselect it or play reserve if possible
        if (this.selectedStackCoords === stackCoords && this.isStackMesh(obj)) {
            // if (this.boardState.haveReservedPieces(this.boardState.getTurn())) {
            if (this.players[this.turn].reservedPieces > 0) {
                // TODO: Replace this function with the controller function that plays the reserve piece and updates the board state
                // const played = applyAction(action: Action);
                // if (played) {
                //   this.unselectStack();
                //   this.updateMeshes();
                // }
                this.startReserveAnimation(stackCoords.row, stackCoords.col, this.turn);
                this.unselectStack();
            }
            else {
                this.unselectStack();
            }
            return;
        }
        // if there are target objects, only allow selecting from those
        if (this.targetOutlinePass.selectedObjects.length > 0) {
            if (this.targetOutlinePass.selectedObjects.includes(obj)) {
                if (!this.selectedStackCoords)
                    return;
                // TODO: Replace this function with the controller function that plays the move action and updates the board state
                // const played = this.boardState.playMove(
                //   Number(this.selectedStackCoords?.split(":")[0]),
                //   Number(this.selectedStackCoords?.split(":")[1]),
                //   row,
                //   col,
                // );
                // if (played) {
                //   this.unselectStack();
                //   this.updateMeshes();
                // }
                //if (!played) { return; }
                const sourcePos = this.selectedStackCoords;
                const destPos = stackCoords;
                // remove the source stack
                this.removeStackMesh(sourcePos.row, sourcePos.col);
                this.startAttackAnimation(sourcePos, destPos);
                this.destPos = destPos;
                this.unselectStack();
                return;
            }
            else {
                this.unselectStack();
                return;
            }
        }
        // if the object is not a stack mesh, unselect any selected stack and return
        if (!this.isStackMesh(obj)) {
            this.unselectStack();
            return;
        }
        this.selectedStackCoords = stackCoords;
        this.selectedOutlinePass.selectedObjects = [obj];
        // if the stack is movable, show the possible moves in the target outline pass
        if (this.isStackMovable(stackCoords.row, stackCoords.col)) {
            this.updateTargetOutlineForMoves(stackCoords.row, stackCoords.col);
        }
        // if the current player has reserved pieces, show the ghost piece in the stack
        if (this.players[this.turn].reservedPieces > 0) {
            this.showGhostPiece(stackCoords.row, stackCoords.col);
        }
    }
    unselectStack() {
        this.selectedStackCoords = null;
        this.selectedOutlinePass.selectedObjects = [];
        this.targetOutlinePass.selectedObjects = [];
        this.hideGhostPiece();
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    // Stack
    mergeAndTrimStacks(fromCoords, toCoords) {
        const sourceStack = this.getStack(fromCoords.row, fromCoords.col);
        const destinationStack = this.getStack(toCoords.row, toCoords.col);
        const merged = [
            ...this.stackMeshToPieces(destinationStack),
            ...this.stackMeshToPieces(sourceStack),
        ];
        const overflow = Math.max(0, merged.length - MAX_ALTURA_PILHA);
        const trimmed = merged.slice(overflow);
        this.removeStackMesh(toCoords.row, toCoords.col);
        const rebuilt = this.createStackMesh(trimmed, toCoords.row, toCoords.col);
        this.stacksMeshes[toCoords.row][toCoords.col] = rebuilt;
        if (rebuilt) {
            this.scene.add(rebuilt);
        }
    }
    applyReservePieceAndTrim(row, col, color) {
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
    stackMeshToPieces(mesh) {
        if (!mesh)
            return [];
        const stackMats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
        return stackMats
            .map((material) => {
            const mat = material;
            const colorHex = mat.color?.getHex();
            if (colorHex === 0xff3b30)
                return { color: "red" };
            if (colorHex === 0x34c759)
                return { color: "green" };
            return null;
        })
            .filter((piece) => piece !== null);
    }
    createStackMesh(stack, row, col) {
        if (stack === null || stack.length === 0)
            return null;
        const geometries = stack.map((stack, stackIndex) => {
            const g = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32);
            g.translate((col - OFFSET) * SPACING, 0.15 + stackIndex * 0.22, (row - OFFSET) * SPACING);
            return g;
        });
        const merged = mergeGeometries(geometries, true);
        geometries.forEach((g) => g.dispose());
        if (!merged)
            return null;
        const materials = stack.map((piece) => new THREE.MeshStandardMaterial({
            color: piece.color === "red" ? 0xff3b30 : 0x34c759,
        }));
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
    removeStackMesh(row, col) {
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
    isStackMesh(obj) {
        const d = obj.userData;
        return (obj instanceof THREE.Mesh &&
            d.kind === "stack" &&
            typeof d.row === "number" &&
            typeof d.col === "number" &&
            typeof d.level === "number");
    }
    getStack(row, col) {
        return this.stacksMeshes[row]?.[col] ?? null;
    }
    createStacksMeshes(stacks) {
        return stacks.map((row, rowIndex) => row.map((cell, colIndex) => {
            return this.createStackMesh(cell ?? [], rowIndex, colIndex);
        }));
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    // Board
    isBoardMesh(obj) {
        const d = obj.userData;
        return (obj instanceof THREE.Mesh &&
            d.kind === "board" &&
            typeof d.row === "number" &&
            typeof d.col === "number");
    }
    createBoardMeshes(stack) {
        return stack.map((row, rowIndex) => row.map((cell, colIndex) => {
            if (cell === null)
                return null;
            const isEven = (rowIndex + colIndex) % 2 === 0;
            const color = isEven ? 0x1e293b : 0x334155;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), new THREE.MeshStandardMaterial({ color }));
            mesh.position.set((colIndex - OFFSET) * SPACING, 0, (rowIndex - OFFSET) * SPACING);
            mesh.userData = {
                ...mesh.userData,
                kind: "board",
                row: rowIndex,
                col: colIndex,
            };
            return mesh;
        }));
    }
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    // Util
    setupScene(scene) {
        scene.add(...this.stacksMeshes.flat().filter((m) => m !== null));
        scene.add(...this.boardMesh.flat().filter((m) => m !== null));
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
    ///////////////////////////////////////////////////////////////////////////////////////////////////
    // Animation
    updateAttackAnimation(deltaSec) {
        if (!this.attackAnimation)
            return;
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
            this.stacksMeshes[a.fromCoords.row][a.fromCoords.col] = null;
            this.destPos = null;
            this.attackAnimation = null;
        }
    }
    updateReserveAnimation(deltaSec) {
        if (!this.reserveAnimation)
            return;
        const a = this.reserveAnimation;
        a.elapsed = Math.min(a.elapsed + deltaSec, a.duration);
        const t = a.elapsed / a.duration;
        const eased = 1 - (1 - t) * (1 - t) * (1 - t);
        a.mesh.position.lerpVectors(a.from, a.to, eased);
        if (t >= 1) {
            this.scene.remove(a.mesh);
            a.mesh.geometry.dispose();
            a.mesh.material.dispose();
            this.applyReservePieceAndTrim(a.targetCoords.row, a.targetCoords.col, a.color);
            if (this.players[a.color].reservedPieces > 0) {
                this.players[a.color].reservedPieces -= 1;
            }
            if (reserveInfoRedElement)
                reserveInfoRedElement.textContent = `Red: ${this.players.red.reservedPieces}`;
            if (reserveInfoGreenElement)
                reserveInfoGreenElement.textContent = `Green: ${this.players.green.reservedPieces}`;
            this.reserveAnimation = null;
        }
    }
    startReserveAnimation(row, col, color) {
        if (this.attackAnimation || this.reserveAnimation)
            return;
        const targetStack = this.getStack(row, col);
        const targetLevel = Number(targetStack?.userData.level ?? 0);
        const colorHex = color === "red" ? 0xff3b30 : 0x34c759;
        const animated = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 32), new THREE.MeshStandardMaterial({ color: colorHex }));
        const x = (col - OFFSET) * SPACING;
        const z = (row - OFFSET) * SPACING;
        const from = new THREE.Vector3(x, 1.6, z);
        const to = new THREE.Vector3(x, 0.15 + targetLevel * 0.22, z);
        animated.position.copy(from);
        animated.raycast = () => { };
        this.scene.add(animated);
        this.reserveAnimation = {
            mesh: animated,
            from,
            to,
            targetCoords: { row, col },
            color,
            elapsed: 0,
            duration: 0.3,
        };
    }
    startAttackAnimation(sourcePos, destPos) {
        if (this.attackAnimation)
            return;
        const fromRow = sourcePos.row;
        const fromCol = sourcePos.col;
        const toRow = destPos.row;
        const toCol = destPos.col;
        if (Number.isNaN(fromRow) ||
            Number.isNaN(fromCol) ||
            Number.isNaN(toRow) ||
            Number.isNaN(toCol)) {
            return;
        }
        const sourceStack = this.getStack(fromRow, fromCol);
        if (!sourceStack)
            return;
        let height = 0;
        const targetStack = this.getStack(toRow, toCol);
        if (targetStack) {
            height = Number(targetStack.userData.level ?? 0);
        }
        // clone mesh so current board state can remain unchanged for now
        const animated = sourceStack.clone();
        animated.geometry = sourceStack.geometry.clone();
        const srcMats = Array.isArray(sourceStack.material)
            ? sourceStack.material
            : [sourceStack.material];
        animated.material = srcMats.map((m) => m.clone());
        animated.position.copy(sourceStack.position);
        animated.raycast = () => { }; // ignore clicks
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
}
//# sourceMappingURL=board.js.map