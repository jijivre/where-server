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
});

app.use(cors());
app.use(express.json());

const connectedGuides = new Map<string, string>();

app.get("/", (req, res) => {
  res.send("✅ Serveur Express + Socket.IO + WebRTC en ligne !");
});

io.on("connection", (socket) => {
  console.log("🔗 Client connecté", socket.id);

  socket.on("joinAsGuide", (guideName: string) => {
    connectedGuides.set(socket.id, guideName);
    console.log(`🎤 Guide connecté: ${guideName}`);
    io.emit("guidesUpdate", Array.from(connectedGuides.values()));
  });

  // Chat classique
  socket.on("message", (msg: string) => {
    console.log("📩 Message reçu:", msg);
    io.emit("message", msg);
  });

  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("iceCandidate", ({ to, candidate }) => {
    io.to(to).emit("iceCandidate", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    const guideName = connectedGuides.get(socket.id);
    if (guideName) {
      console.log(`❌ Guide déconnecté: ${guideName}`);
      connectedGuides.delete(socket.id);
      io.emit("guidesUpdate", Array.from(connectedGuides.values()));
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});
