import express from 'express';
import cors from 'cors'
import { Server } from 'socket.io';
import { createServer } from 'http';
import crypto from 'crypto';

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e6,
});

app.use(cors());
app.use(express.json());

const connectedGuides = new Map<string, string>();

const genPIN = () => crypto.randomBytes(3).toString("hex").toUpperCase(); 

type Player = { socketId: string; pseudo: string; isHost: boolean; roomId: string;position?: { x: number; y: number };lastPositionUpdate?: number;};

const players = new Map<string, Player>();

function getPlayers(roomId: string) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return [];

  return Array.from(players.values()).filter(p => p.roomId === roomId);
}

io.on('connection', (socket) => {

  socket.on("joinAsGuide", (guideName: string) => {
    connectedGuides.set(socket.id, guideName);
    console.log(`🎤 Guide connecté: ${guideName}`);
    io.emit("guidesUpdate", Array.from(connectedGuides.values()));
  });

  socket.on("message", (msg: string) => {
    console.log("📩 Message reçu:", msg);
    io.emit("message", msg);
  });

  socket.on("webrtc-offer", (offer) => {
    socket.broadcast.emit("webrtc-offer", offer);
  });

  socket.on("webrtc-answer", (answer) => {
    socket.broadcast.emit("webrtc-answer", answer);
  });

  socket.on("webrtc-candidate", (candidate) => {
    socket.broadcast.emit("webrtc-candidate", candidate);
  });

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

  // Gestion des positions des joueurs
  socket.on('player:position', (data: { roomId: string; pseudo: string; position: { x: number; y: number }; timestamp: number }) => {
    const player = players.get(socket.id);
    if (!player || player.roomId !== data.roomId) return;

    // Mettre à jour la position du joueur
    players.set(socket.id, {
      ...player,
      position: data.position,
      lastPositionUpdate: data.timestamp
    });

    // Diffuser la position à tous les joueurs de la salle
    io.to(data.roomId).emit('player:position:update', {
      socketId: socket.id,
      pseudo: data.pseudo,
      position: data.position,
      timestamp: data.timestamp
    });
  });


  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    const guideName = connectedGuides.get(socket.id);
    if (player) {
      players.delete(socket.id);
      io.to(player.roomId).emit("room:players", getPlayers(player.roomId));
    }

    if (guideName) {
      connectedGuides.delete(socket.id);
      io.emit("guidesUpdate", Array.from(connectedGuides.values()));
    } else {
      console.log("❌ Client déconnecté", socket.id);
    }
  });

});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});

export { app };



