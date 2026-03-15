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

export async function userPlay(action: any) {
    const req = { action };
    const response = await fetch(`${SERVER_URL}/api/play/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
    });
    return response.json();
}

export async function aiPlay() {
    const response = await fetch(`${SERVER_URL}/api/play/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    return response.json();
}