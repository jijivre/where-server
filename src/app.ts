import express, { type Request, type Response } from 'express';
import cors from 'cors'
import { Server, Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import session from "express-session";

const app = express();
const server = createServer(app);

app.use(express.json());

app.use(cors())

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


app.post('/auth/login', (req: Request, res: Response) => {
  console.log('Login endpoint hit', req.body.pin);
  if(req.body.pin === '1234') {
    res.json("success");
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});



const players = new Set();

io.on('connection', (socket) => {
  console.log('a user connected', players);
  socket.emit('player:list', Array.from(players));
  socket.on('player:create', (pseudo, ack) => {
    if (!pseudo) return ack?.({ ok:false });
    players.add(pseudo);
    ack?.({ ok:true, pseudo });
    io.emit('player:list', Array.from(players));
    socket.on('disconnect', () => {
      players.delete(pseudo);
      io.emit('player:list', Array.from(players));
    });
  });
});

const PORT = 3001;

server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});

export { app };



