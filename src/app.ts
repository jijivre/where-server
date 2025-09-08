import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e6
});

app.use(cors());
app.use(express.json());

const connectedGuides = new Map();

app.get('/', (req, res) => {
  res.send('✅ Serveur Express + Socket.IO avec Audio tourne !');
});

io.on('connection', (socket) => {
  console.log('🔗 Client connecté', socket.id);

  socket.on('joinAsGuide', (guideName) => {
    connectedGuides.set(socket.id, guideName);
    console.log(`🎤 Guide connecté: ${guideName}`);

    io.emit('guidesUpdate', Array.from(connectedGuides.values()));
  });

  socket.on('message', (msg) => {
    console.log('📩 Message reçu:', msg);
    io.emit('message', msg);
  });

  socket.on('audioMessage', (data) => {
    console.log(`🎤 Audio reçu de: ${data.from}`);

    socket.broadcast.emit('audioMessage', data);

    // TODO: Ici  pour envoyer l'audio vers Unity

    console.log('🔊 Audio diffusé aux autres guides');
  });

  socket.on('disconnect', () => {
    const guideName = connectedGuides.get(socket.id);
    if (guideName) {
      console.log(`❌ Guide déconnecté: ${guideName}`);
      connectedGuides.delete(socket.id);

      io.emit('guidesUpdate', Array.from(connectedGuides.values()));
    } else {
      console.log('❌ Client déconnecté', socket.id);
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
  console.log(`🎤 Prêt pour l'audio vocal`);
});