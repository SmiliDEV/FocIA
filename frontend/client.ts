const SERVER_URL = 'http://localhost:3000';

type Player = 'USER' | 'AI';
export async function startGame(player1: Player, player2: Player) {
    const req = {player1, player2};
    const response = await fetch(`${SERVER_URL}/api/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
    });
    return response.json();
}