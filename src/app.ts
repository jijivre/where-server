import express from 'express';
import cors from 'cors';
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
// const DEFAULT_ROOM_ID = '123456';

const genPIN = () => crypto.randomBytes(3).toString("hex").toUpperCase();

type Player = {
  socketId: string;
  pseudo: string;
  isHost: boolean;
  roomId: string
};

const players = new Map<string, Player>();
const existingRooms = new Set<string>();

function getPlayers(roomId: string) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return [];
  return Array.from(players.values()).filter(p => p.roomId === roomId);
}

// function createDefaultRoom() {
//   existingRooms.add(DEFAULT_ROOM_ID);
//   console.log(`📌 Room par défaut créée avec le PIN : ${DEFAULT_ROOM_ID}`);
// }

// createDefaultRoom();

io.on('connection', (socket) => {
  console.log(`🔌 Nouveau client connecté: ${socket.id}`);

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
    existingRooms.add(roomId);

    console.log(`🏠 Nouvelle room créée: ${roomId} par ${socket.id}`);

    socket.emit('room:players', []);
    socket.emit('room:create:response', { ok: true, roomId });

    if (ack) ack({ ok: true, roomId });
  });

  socket.on("room:join", ({ roomId }: { roomId: string }, ack) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const roomExists = existingRooms.has(roomId) || room;

    if (!roomExists) {
      console.log(`❌ Tentative de connexion à une room inexistante: ${roomId}`);
      return ack?.({ ok: false, error: "PIN invalide" });
    }

    console.log(`✅ Connexion à la room: ${roomId}`);

    players.set(socket.id, {
      socketId: socket.id,
      pseudo: "Anonyme",
      isHost: false,
      roomId
    });

    socket.join(roomId);

    io.to(roomId).emit("room:players", getPlayers(roomId));

    ack?.({ ok: true, players: getPlayers(roomId) });
  });

  socket.on('player:create', (pseudo: string, ack?: (res: any) => void) => {
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

  socket.on('game:launch', (_, ack?: (res: any) => void) => {
    const player = players.get(socket.id);
    if (!player) return ack?.({ ok: false, error: 'Joueur non trouvé'});

    if (!player.isHost) return ack?.({ ok: false, error: 'Seul l\'hôte peut lancer la partie'});

    io.to(player.roomId).emit("game:started");
    console.log(`🎮 Partie lancée dans la room ${player.roomId} par ${player.pseudo}`);
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    const guideName = connectedGuides.get(socket.id);

    if (player) {
      players.delete(socket.id);
      io.to(player.roomId).emit("room:players", getPlayers(player.roomId));

      const remainingPlayers = getPlayers(player.roomId);
      if (remainingPlayers.length === 0) {
        // if (remainingPlayers.length === 0 && player.roomId !== DEFAULT_ROOM_ID) {
        existingRooms.delete(player.roomId);
        console.log(`🗑️ Room ${player.roomId} supprimée (vide)`);
      }
    }

    if (guideName) {
      connectedGuides.delete(socket.id);
      io.emit("guidesUpdate", Array.from(connectedGuides.values()));
      console.log(`🎤 Guide déconnecté: ${guideName}`);
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