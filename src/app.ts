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
  obstacleType?: ObstacleType; // Pour compatibilité
  obstacleTypes?: ObstacleType[]; // Nouveau: plusieurs obstacles
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
  const guideCount = guides.length;

  // Toujours utiliser TOUS les obstacles disponibles
  const allObstacles: ObstacleType[] = [
    ObstacleType.Walls,
    ObstacleType.Box,
    ObstacleType.Box2,
    ObstacleType.Ladder,
    ObstacleType.Vase,
    ObstacleType.Box3,
    ObstacleType.Chest,
  ];

  // Calculer la répartition équitable de TOUS les obstacles
  const obstaclesPerPlayer = Math.floor(allObstacles.length / guideCount);
  const remainingObstacles = allObstacles.length % guideCount;

  console.log(`🎯 Répartition: ${guideCount} joueurs, ${allObstacles.length} obstacles`);
  console.log(`📊 ${obstaclesPerPlayer} obstacles par joueur + ${remainingObstacles} joueurs avec 1 obstacle en plus`);

  // Mélanger les obstacles
  const shuffledObstacles = [...allObstacles];
  for (let i = shuffledObstacles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledObstacles[i], shuffledObstacles[j]] = [shuffledObstacles[j], shuffledObstacles[i]];
  }

  // Assigner les obstacles à chaque joueur
  let obstacleIndex = 0;
  guides.forEach((guide, playerIndex) => {
    // Calculer combien d'obstacles ce joueur doit avoir
    let obstaclesForThisPlayer = obstaclesPerPlayer;
    if (playerIndex < remainingObstacles) {
      obstaclesForThisPlayer += 1; // Ce joueur aura un obstacle en plus
    }

    // Assigner les obstacles à ce joueur
    const assignedObstacles: ObstacleType[] = [];
    for (let i = 0; i < obstaclesForThisPlayer && obstacleIndex < shuffledObstacles.length; i++) {
      assignedObstacles.push(shuffledObstacles[obstacleIndex]);
      obstacleIndex++;
    }

    // Mettre à jour le joueur avec ses obstacles
    players.set(guide.socketId, { ...guide, obstacleTypes: assignedObstacles });
    
    // Envoyer les obstacles assignés au joueur
    io.to(guide.socketId).emit("obstacles:assigned", { 
      obstacleTypes: assignedObstacles,
      totalObstacles: assignedObstacles.length
    });

    console.log(`👤 ${guide.pseudo} a reçu ${assignedObstacles.length} obstacles: ${assignedObstacles.join(', ')}`);
  });

  // Vérifier que tous les obstacles ont été assignés
  const totalAssigned = guides.reduce((sum, guide) => {
    const player = players.get(guide.socketId);
    return sum + (player?.obstacleTypes?.length || 0);
  }, 0);
  
  console.log(`✅ Total obstacles assignés: ${totalAssigned}/${allObstacles.length}`);
}

// Fonction pour réassigner automatiquement les obstacles
function reassignObstaclesAutomatically(roomId: string) {
  const guides = getPlayers(roomId).filter(p => p.role === Role.Guide);
  
  // Ne réassigner que s'il y a au moins 1 joueur guide
  if (guides.length === 0) {
    console.log(`[${roomId}] Aucun guide, pas de réassignation d'obstacles`);
    return;
  }

  console.log(`🔄 Réassignation automatique des obstacles pour ${guides.length} guides dans la room ${roomId}`);
  assignRandomObstaclePerPlayer(roomId);
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

    const roomPlayers = getPlayers(roomId);
    io.to(roomId).emit('room:players', roomPlayers);

    // Réassigner automatiquement les obstacles quand un joueur rejoint
    reassignObstaclesAutomatically(roomId);

    ack?.({ ok: true, players: roomPlayers });
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

    // Les obstacles sont déjà assignés automatiquement, on lance juste la partie
    io.to(player.roomId).emit("game:started");
    console.log(`🎮 Partie lancée dans la room ${player.roomId} par ${player.pseudo}`);
    ack?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    const guideName = connectedGuides.get(socket.id);

    if (player) {
      const roomId = player.roomId;
      players.delete(socket.id);
      
      const remainingPlayers = getPlayers(roomId);
      io.to(roomId).emit('room:players', remainingPlayers);

      // Réassigner automatiquement les obstacles quand un joueur quitte
      if (remainingPlayers.length > 0) {
        reassignObstaclesAutomatically(roomId);
      }

      if (remainingPlayers.length === 0) {
        // if (remainingPlayers.length === 0 && player.roomId !== DEFAULT_ROOM_ID) {
        existingRooms.delete(roomId);
        console.log(`🗑️ Room ${roomId} supprimée (vide)`);
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
