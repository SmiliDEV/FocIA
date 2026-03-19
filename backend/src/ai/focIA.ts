import { FocusState } from '../game/focus';
import type { PlayerColor } from '@shared-types';

const WIN_BASE = 1_000_000;

export interface Weights {
    w_center: number;
    w_ortho: number;
    w_capt: number;
    w_res: number;
    w_piles: number;
    w_mob: number;
    w_tempo?: number;
}

export const WEIGHTS_FIRST: Weights = {
    "w_center": 0.23163635004225364,
    "w_ortho": 1.0528317004569732,
    "w_capt": 4.5522768225852746,
    "w_res": 9.559906233510308,
    "w_piles": 4.597586696548793,
    "w_mob": 3.9292737177979795
};

export const WEIGHTS_SECOND: Weights = {
    "w_center": 0.39636533019101206,
    "w_ortho": 0.5148363961231621,
    "w_capt": 2.5521272997370663,
    "w_res": 9.237860471543698,
    "w_piles": 4.507804501701827,
    "w_mob": 3.2913805868475463
};

function centerValue(posKey: string, jogador: PlayerColor, estado: FocusState): number {
    const stack = estado.board.get(posKey);
    if (stack && stack.length > 0) {
        const topPiece = stack[stack.length - 1]; // topPiece logic from TS state
        const [x, y] = posKey.split(',').map(Number);

        // Python: c = 1.0 - (abs(pos[0] - 1.5) + abs(pos[1] - 1.5)) / 3.0
        let c = 1.0 - (Math.abs(x - 1.5) + Math.abs(y - 1.5)) / 3.0;
        c = Math.max(0.0, Math.min(c, 1.0));

        return topPiece === jogador ? c : -c;
    }
    return 0.0;
}

type PosInfo = { x: number, y: number, h: number };

function singlePassFeatures(estado: FocusState, jogador: PlayerColor, needCenter: boolean = true, needOrtho: boolean = true): { sumCenter: number, sumOrtho: number } {
    const opponent = jogador === 'RED' ? 'GREEN' : 'RED';
    let centerSum = 0.0;

    // Map<coordinate, Array<{other_coord, height}>>
    const ownByRow = new Map<number, {c: number, h: number}[]>();
    const ownByCol = new Map<number, {c: number, h: number}[]>();
    const oppByRow = new Map<number, {c: number, h: number}[]>();
    const oppByCol = new Map<number, {c: number, h: number}[]>();

    const ownPositions: PosInfo[] = [];

    for (const [posKey, stack] of estado.board.entries()) {
        if (!stack || stack.length === 0) continue;

        const [x, y] = posKey.split(',').map(Number);
        const top = stack[stack.length - 1];
        const h = stack.length;

        if (needCenter) {
            centerSum += centerValue(posKey, jogador, estado);
        }

        if (needOrtho) {
            if (top === jogador) {
                ownPositions.push({ x, y, h });

                if (!ownByRow.has(x)) ownByRow.set(x, []);
                ownByRow.get(x)!.push({ c: y, h });

                if (!ownByCol.has(y)) ownByCol.set(y, []);
                ownByCol.get(y)!.push({ c: x, h });

            } else if (top === opponent) {
                // oppPositions.push({ x, y, h });

                if (!oppByRow.has(x)) oppByRow.set(x, []);
                oppByRow.get(x)!.push({ c: y, h });

                if (!oppByCol.has(y)) oppByCol.set(y, []);
                oppByCol.get(y)!.push({ c: x, h });
            }
        }
    }

    let orthoLine = 0.0;
    if (needOrtho) {
        let lineSupport = 0;
        let lineThreats = 0;

        for (const { x, y, h } of ownPositions) {
            // Threats from opponent in same row
            const oppsInRow = oppByRow.get(x) || [];
            for (const { c: oy, h: oh } of oppsInRow) {
                const d = Math.abs(y - oy);
                if (d > 0 && oh === d) lineThreats++;
            }

            // Threats from opponent in same col
            const oppsInCol = oppByCol.get(y) || [];
            for (const { c: ox, h: oh } of oppsInCol) {
                const d = Math.abs(x - ox);
                if (d > 0 && oh === d) lineThreats++;
            }

            // Support from self in same row
            const ownInRow = ownByRow.get(x) || [];
            for (const { c: fy, h: fh } of ownInRow) {
                const d = Math.abs(y - fy);
                if (d > 0 && fh === d) lineSupport++;
            }

            // Support from self in same col
            const ownInCol = ownByCol.get(y) || [];
            for (const { c: fx, h: fh } of ownInCol) {
                const d = Math.abs(x - fx);
                if (d > 0 && fh === d) lineSupport++;
            }
        }
        orthoLine = lineSupport - lineThreats;
    }

    return { sumCenter: centerSum, sumOrtho: orthoLine };
}

function mobilityPossibleMoves(estado: FocusState, jogador: PlayerColor): number {
    const originalPlayer = estado.to_move;

    // Force player
    estado.to_move = jogador;
    const moves = estado.possibleMoves();
    estado.to_move = originalPlayer; // Restore

    let count = 0;
    for (const m of moves) {
        if (m.kind !== 'RESERVE') {
            count++;
        }
    }
    return count;
}

export function evalFn(estado: FocusState, jogador: PlayerColor): number {
    const winner = estado.winner();
    if (winner !== null) {
        const d = estado.n_plays;
        return winner === jogador ? (WIN_BASE - d) : -(WIN_BASE - d);
    }

    const opponent = jogador === 'RED' ? 'GREEN' : 'RED';
    const w = (estado.n_plays === 0) ? WEIGHTS_FIRST : WEIGHTS_SECOND;

    const wc = w.w_center || 0.0;
    const wo = w.w_ortho || 0.0;
    const wcapt = w.w_capt || 0.0;
    const wres = w.w_res || 0.0;
    const wpiles = w.w_piles || 0.0;
    const wmob = w.w_mob || 0.0;
    const wtempo = w.w_tempo || 0.0;

    const needCenter = Math.abs(wc) > 1e-12;
    const needOrtho = Math.abs(wo) > 1e-12;

    const { sumCenter, sumOrtho } = singlePassFeatures(estado, jogador, needCenter, needOrtho);

    // Captured diff
    const captDiff = (estado.captured[jogador] || 0) - (estado.captured[opponent] || 0);

    // Reserve diff
    const resDiff = (estado.reserve[jogador] || 0) - (estado.reserve[opponent] || 0);

    // Piles diff
    let pilesDiff = 0.0;
    if (Math.abs(wpiles) > 1e-12) {
        pilesDiff = estado.dominatePiles(jogador) - estado.dominatePiles(opponent);
    }

    // Mobility
    let mobilityTerm = 0.0;
    if (Math.abs(wmob) > 1e-12) {
        const mobOwn = mobilityPossibleMoves(estado, jogador);
        const mobOpp = mobilityPossibleMoves(estado, opponent);
        const denom = mobOwn + mobOpp;
        if (denom > 0) {
            mobilityTerm = (mobOwn - mobOpp) / denom;
        }
    }

    let val = 0.0;
    if (needCenter) val += wc * sumCenter;
    if (needOrtho) val += wo * sumOrtho;
    if (Math.abs(wcapt) > 1e-12) val += wcapt * captDiff;
    if (Math.abs(wres) > 1e-12) val += wres * resDiff;
    if (Math.abs(wpiles) > 1e-12) val += wpiles * pilesDiff;
    if (Math.abs(wmob) > 1e-12) val += wmob * mobilityTerm;


    const maxNt = WIN_BASE * 0.25;
    if (val > maxNt) val = maxNt;
    if (val < -maxNt) val = -maxNt;

    return val;
}
