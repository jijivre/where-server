import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('✅ Serveur Express + Socket.IO tourne !');
});

io.on('connection', (socket) => {
  console.log('🔗 Client connecté', socket.id);

  socket.on('message', (msg) => {
    console.log('📩 Message reçu:', msg);
    io.emit('message', msg);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client déconnecté', socket.id);
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});
