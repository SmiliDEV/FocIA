export type PlayerColor = "RED" | "GREEN";

export type Coords = {
  x: number;
  y: number;
};

export type MoveAction = {
  kind: "MOVE";
  src: Coords;
  dest: Coords;
};

export type ReserveAction = {
  kind: "RESERVE";
  dest: Coords;
};

export type Action = MoveAction | ReserveAction;

export type ReserveCount = Record<PlayerColor, number>;
export type CapturedCount = Record<PlayerColor, number>;
export type BoardEntry = [string, string[]];

export type FocusBoardConfig = {
	size: number;
	maxStackHeight: number;
	maxPlays: number;
};

export type FocusStateDTO = {
  to_move: PlayerColor;
  board: BoardEntry[];
  reserve: ReserveCount;
  captured: CapturedCount;
  n_plays: number;
};

export type MoveEvent = {
  type: "MOVE";
  action: MoveAction;
  player: PlayerColor;
  sourcePos: Coords;
  destPos: Coords;
  finalDestStack: string[];
  captured: number;
  reserved: number;
  winner: PlayerColor | null;
};

export type ReserveEvent = {
  type: "RESERVE";
  action: ReserveAction;
  player: PlayerColor;
  destPos: Coords;
  finalDestStack: string[];
  captured: number;
  reserved: number;
  winner: PlayerColor | null;
};

export type GameEvent = MoveEvent | ReserveEvent;

export type GetGameResponse = {
	config: FocusBoardConfig;
  state: FocusStateDTO;
};

export type PlayResponse = {
  event: GameEvent;
  state: FocusStateDTO;
};

export type ErrorResponse = {
  error: string;
};

export type UserPlayResponse = PlayResponse | ErrorResponse;
export type AIPlayResponse = PlayResponse | ErrorResponse;
