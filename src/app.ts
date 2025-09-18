import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e6,
});

app.use(cors());
app.use(express.json());

const connectedGuides = new Map<string, string>();
// const DEFAULT_ROOM_ID = '123456';

const genPIN = () => crypto.randomBytes(3).toString("hex").toUpperCase();

enum ObstacleType {
  Walls = "walls",
  Box = "box",
  Box2 = "box2",
  Ladder = "ladder",
  Vase = "vase",
  Box3 = "box3",
  Chest = "chest",
}

enum Role {
  Unity = "unity",
  Guide = "guide",
}

type Player = {
  socketId: string;
  pseudo: string;
  role: Role;
  roomId: string;
  obstacleType?: ObstacleType;
  position?: { x: number; y: number };
  lastPositionUpdate?: number;
};

const players = new Map<string, Player>();
const existingRooms = new Set<string>();

function getPlayers(roomId: string) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return [];
  return Array.from(players.values()).filter((p) => p.roomId === roomId);
}

function assignRandomObstaclePerPlayer(roomId: string) {
  const guides = getPlayers(roomId).filter(p => p.role === Role.Guide);

  const priority: ObstacleType[] = [
    ObstacleType.Walls,
    ObstacleType.Box,
    ObstacleType.Box2,
    ObstacleType.Ladder,
    ObstacleType.Vase,
    ObstacleType.Box3,
    ObstacleType.Chest,
  ];

  const available = priority.slice(0, guides.length);

  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  guides.forEach((g, idx) => {
    const assignedType = available[idx] ?? null;
    players.set(g.socketId, { ...g, obstacleType: assignedType });
    io.to(g.socketId).emit("obstacle:assigned", { obstacleType: assignedType });
  });
}

// Route pour gérer la victoire depuis Unity
app.post('/victory', (req, res) => {
  console.log('🏆 Message de victoire reçu de Unity');

  // Diffuser le message de victoire à tous les clients connectés
  io.emit('game:victory', {
    message: 'Vous avez gagné!',
    timestamp: Date.now()
  });

  res.json({ success: true, message: 'Message de victoire diffusé' });
});

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
    io.emit('guidesUpdate', Array.from(connectedGuides.values()));
  });

  socket.on("message", (msg: string) => {
    console.log("📩 Message reçu:", msg);
    io.emit("message", msg);
  });

  socket.on("webrtc-offer", (offer) => {
    socket.broadcast.emit("webrtc-offer", offer);
  });

  socket.on('webrtc-answer', (answer) => {
    socket.broadcast.emit('webrtc-answer', answer);
  });

  socket.on('webrtc-candidate', (candidate) => {
    socket.broadcast.emit('webrtc-candidate', candidate);
  });

  socket.on('room:create', (_, ack) => {
    const roomId = genPIN();
    socket.join(roomId);
    existingRooms.add(roomId);

    players.set(socket.id, { socketId: socket.id, pseudo: "Anonyme", role: Role.Unity, roomId });

    console.log(`🏠 Nouvelle room créée: ${roomId} par ${socket.id}`);

    socket.emit('room:players', []);
    socket.emit('room:create:response', { ok: true, roomId });

    if (ack) ack({ ok: true, roomId });
  });

  socket.on('room:join', ({ roomId }: { roomId: string }, ack) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const roomExists = existingRooms.has(roomId) || room;

    if (!roomExists) {
      console.log(
        `❌ Tentative de connexion à une room inexistante: ${roomId}`,
      );
      return ack?.({ ok: false, error: 'PIN invalide' });
    }

    console.log(`✅ Connexion à la room: ${roomId}`);

    players.set(socket.id, {
      socketId: socket.id,
      pseudo: "Anonyme",
      role: Role.Guide,
      roomId
    });

    socket.join(roomId);

    io.to(roomId).emit('room:players', getPlayers(roomId));

    ack?.({ ok: true, players: getPlayers(roomId) });
  });

  socket.on('player:create', (pseudo: string, ack?: (res: any) => void) => {
    const p = (pseudo || '').trim();
    if (!p) return ack?.({ ok: false, error: 'Pseudo requis' });

    const existingPlayer = players.get(socket.id);
    if (!existingPlayer)
      return ack?.({ ok: false, error: 'Room non trouvée pour ce joueur' });

    const taken = getPlayers(existingPlayer.roomId).some(
      (pl) => pl.pseudo.toLowerCase() === p.toLowerCase(),
    );
    if (taken) return ack?.({ ok: false, error: 'Pseudo déjà pris' });

    players.set(socket.id, { ...existingPlayer, pseudo: p });
    ack?.({ ok: true, pseudo: p });

    io.to(existingPlayer.roomId).emit(
      'room:players',
      getPlayers(existingPlayer.roomId),
    );
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

  socket.on('game:launch', (_, ack?: (res: any) => void) => {
    const player = players.get(socket.id);
    if (!player) return ack?.({ ok: false, error: 'Joueur non trouvé'});

    if (player.role == Role.Guide) return ack?.({ ok: false, error: 'Seul le joueur Unity peut lancer la partie'});

    assignRandomObstaclePerPlayer(player.roomId);

    io.to(player.roomId).emit("game:started");
    console.log(`🎮 Partie lancée dans la room ${player.roomId} par ${player.pseudo}`);
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    const guideName = connectedGuides.get(socket.id);

    if (player) {
      players.delete(socket.id);
      io.to(player.roomId).emit('room:players', getPlayers(player.roomId));

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
      console.log('❌ Client déconnecté', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});

export { app };