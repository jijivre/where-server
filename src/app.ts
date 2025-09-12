import express from 'express';
import cors from 'cors'
import { Server } from 'socket.io';
import { createServer } from 'http';
import crypto from 'crypto';

const app = express();
const server = createServer(app);

app.use(cors())

const genPIN = () => crypto.randomBytes(3).toString("hex").toUpperCase(); 

type Player = { socketId: string; pseudo: string; isHost: boolean, roomId: string };

const players = new Map<string, Player>();

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

function getPlayers(roomId: string) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return [];

  return Array.from(players.values()).filter(p => p.roomId === roomId);
}

io.on('connection', (socket) => {

  socket.on("room:create", (_, ack) => {
    const roomId = genPIN();

    socket.join(roomId);

    ack({ ok: true, roomId });
  });


socket.on("room:join", ({ roomId }: { roomId: string }, ack) => {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return ack?.({ ok: false, error: "PIN invalide" });

  players.set(socket.id, { socketId: socket.id, pseudo: "Anonyme", isHost: false, roomId });
  socket.join(roomId);

  io.to(roomId).emit("room:players", getPlayers(roomId));

  ack?.({ ok: true, players: getPlayers(roomId) });
});

socket.on('player:create', (pseudo: string, ack?: (res:any)=>void) => {
  const p = (pseudo || '').trim();
  if (!p) return ack?.({ ok: false, error: 'Pseudo requis'});

  const existingPlayer = players.get(socket.id);
  if (!existingPlayer) return ack?.({ ok: false, error: 'Room non trouvée pour ce joueur'});

  const taken = getPlayers(existingPlayer.roomId)
    .some(pl => pl.pseudo.toLowerCase() === p.toLowerCase());
  if (taken) return ack?.({ ok: false, error: 'Pseudo déjà pris'});

  players.set(socket.id, { ...existingPlayer, pseudo: p });
  ack?.({ ok: true, pseudo: p });

  io.to(existingPlayer.roomId).emit("room:players", getPlayers(existingPlayer.roomId));
});


socket.on('disconnect', () => {
  const player = players.get(socket.id);
  if (player) {
    players.delete(socket.id);
    io.to(player.roomId).emit("room:players", getPlayers(player.roomId));
  }
});

});

const PORT = 3001;

server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});

export { app };



