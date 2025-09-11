import express, { type Request, type Response } from 'express';
import cors from 'cors'
import { Server, Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import session from "express-session";
import crypto from 'crypto';

const app = express();
const server = createServer(app);

app.use(express.json());

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


app.use(
  session({
    secret: "SecretSession",
    resave: false,
    saveUninitialized: false,
  })
);

function getPlayers(roomId: string) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return [];

  return Array.from(players.values()).filter(p => p.roomId === roomId);
  
}



io.on('connection', (socket) => {

    socket.on("room:create", (_, ack) => {
    const roomId = genPIN();

    socket.join(roomId);

    console.log(`Room ${roomId} créée par ${socket.id}`);

    ack({ ok: true, roomId });
  });

  socket.on("room:join", ({ roomId }: { roomId: string }, ack) => {

    const room = io.sockets.adapter.rooms.get(roomId);
    if (!room) return ack?.({ ok: false, error: "PIN invalide" });

    players.set(socket.id, { socketId: socket.id, pseudo: "Anonyme", isHost: false, roomId });


    socket.join(roomId);

    ack?.({ ok: true, players: getPlayers(roomId) });
  });


  socket.on('player:create', (pseudo: string, ack?: (res:any)=>void) => {
    const p = (pseudo || '').trim();
    if (!p) return ack?.({ ok: false, error: 'Pseudo requis' });


    const taken = Array.from(players.values()).some(pl => pl.pseudo === p);

    if (taken) return ack?.({ ok: false, error: 'Pseudo déjà pris' });


    players.set(socket.id, {
      pseudo: p,
      socketId: socket.id,
      isHost: false,
      roomId: players.get(socket.id)!.roomId
    });

    ack?.({ ok: true, pseudo: p });

    io.to(players.get(socket.id)!.roomId).emit("room:players", getPlayers(players.get(socket.id)!.roomId));
  });
  
});

const PORT = 3001;

server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});

export { app };



