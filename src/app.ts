import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 10e6,
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors());
app.use(express.json());

const connectedGuides = new Map<string, string>();
const activeStreamers = new Set<string>();

app.get("/", (_req, res) => {
  res.send("✅ Serveur Express + Socket.IO Streaming sur Render !");
});

io.on("connection", (socket) => {
  console.log("🔗 Client connecté", socket.id);

  socket.on("joinAsGuide", (guideName: string) => {
    connectedGuides.set(socket.id, guideName);
    console.log(`🎤 Guide connecté: ${guideName}`);
    io.emit("guidesUpdate", Array.from(connectedGuides.values()));
  });

  socket.on("message", (msg: string) => {
    console.log("📩 Message reçu:", msg);
    io.emit("message", msg);
  });

  socket.on("streamStart", (data: { from: string }) => {
    console.log(`🔴 ${data.from} commence à streamer`);
    activeStreamers.add(socket.id);
    socket.broadcast.emit("streamStart", data);
  });

  socket.on("streamEnd", (data: { from: string }) => {
    console.log(`⚫ ${data.from} arrête de streamer`);
    activeStreamers.delete(socket.id);
    socket.broadcast.emit("streamEnd", data);
  });

  socket.on("audioChunk", (data: { from: string; audio: string }) => {
    socket.broadcast.emit("audioChunk", data);
  });

  socket.on("disconnect", () => {
    const guideName = connectedGuides.get(socket.id);

    if (activeStreamers.has(socket.id) && guideName) {
      activeStreamers.delete(socket.id);
      socket.broadcast.emit("streamEnd", { from: guideName });
    }

    if (guideName) {
      console.log(`❌ Guide déconnecté: ${guideName}`);
      connectedGuides.delete(socket.id);
      io.emit("guidesUpdate", Array.from(connectedGuides.values()));
    } else {
      console.log("❌ Client déconnecté", socket.id);
    }
  });

  socket.on("error", (error) => {
    console.error("❌ Erreur socket:", error);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Serveur Streaming sur http://localhost:${PORT}`);
});