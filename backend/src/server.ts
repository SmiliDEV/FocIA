import express from 'express';
import cors from 'cors';
import { handleStartGame, handleUserMovement, handleAIPlay } from './controller/controller';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post('/api/start', (req, res) => {
    try {
        const result = handleStartGame();
        return res.json(result);
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

app.post('/api/play/user', (req, res) => {
    try {
        const action = req.body.action;

        if (!action) {
            return res.status(400).json({ error: 'Missing action object in request body' });
        }

        const result = handleUserMovement({ action });
        return res.json(result);

    } catch (e: any) {
        return res.status(400).json({ error: e.message });
    }
});

// Aqui req pode ser vazio, a IA vai jogar com base no estado atual guardado no backend
app.post('/api/play/ai', (req, res) => {
    try {
        const result = handleAIPlay();
        return res.json(result);
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`[FocIA Server] Servidor a correr na porta http://localhost:${PORT}`);
    console.log(`[FocIA Server] Podes fazer fetches para http://localhost:${PORT}/api/...`);
});