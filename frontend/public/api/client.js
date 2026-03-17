const SERVER_URL = 'http://localhost:3000';
export async function startGame() {
    const response = await fetch(`${SERVER_URL}/api/start`, { method: 'POST' });
    return response.json();
}
export async function userPlay(action) {
    const req = { action };
    const response = await fetch(`${SERVER_URL}/api/play/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
    });
    return response.json();
}
export async function aiPlay() {
    const response = await fetch(`${SERVER_URL}/api/play/ai`, { method: 'POST' });
    return response.json();
}
//# sourceMappingURL=client.js.map