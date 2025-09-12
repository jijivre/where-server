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
  maxHttpBufferSize: 1e6,
});

app.use(cors());
app.use(express.json());

const connectedGuides = new Map<string, string>();

app.get("/", (req, res) => {
  res.send("✅ Serveur Express + Socket.IO + WebRTC tourne !");
});

io.on("connection", (socket) => {
  console.log("🔗 Client connecté", socket.id);

  socket.on("joinAsGuide", (guideName: string) => {
    connectedGuides.set(socket.id, guideName);
    console.log(`🎤 Guide connecté: ${guideName}`);
    io.emit("guidesUpdate", Array.from(connectedGuides.values()));
  });

  // Messages texte
  socket.on("message", (msg: string) => {
    console.log("📩 Message reçu:", msg);
    io.emit("message", msg);
  });

  // Signaling WebRTC
  socket.on("webrtc-offer", (offer) => {
    socket.broadcast.emit("webrtc-offer", offer);
  });

  socket.on("webrtc-answer", (answer) => {
    socket.broadcast.emit("webrtc-answer", answer);
  });

  socket.on("webrtc-candidate", (candidate) => {
    socket.broadcast.emit("webrtc-candidate", candidate);
  });

  socket.on("disconnect", () => {
    const guideName = connectedGuides.get(socket.id);
    if (guideName) {
      console.log(`❌ Guide déconnecté: ${guideName}`);
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