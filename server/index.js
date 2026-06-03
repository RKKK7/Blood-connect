import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import { connectDB } from "./config/db.js";
import authRoutes         from "./routes/auth.js";
import donorRoutes        from "./routes/donors.js";
import requestRoutes      from "./routes/requests.js";
import notificationRoutes from "./routes/notifications.js";
import adminRoutes        from "./routes/admin.js";
import matchRoutes        from "./routes/match.js";
import shortageRoutes     from "./routes/shortage.js";
import certificateRoutes  from "./routes/certificate.js";
import chatRoutes         from "./routes/chat.js";
import analyticsRoutes    from "./routes/analytics.js";
import { startCronJobs }  from "./services/cronJobs.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

export const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true },
});

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json());

connectDB();

app.use("/api/auth",          authRoutes);
app.use("/api/donors",        donorRoutes);
app.use("/api/requests",      requestRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin",         adminRoutes);
app.use("/api/match",         matchRoutes);
app.use("/api/shortage",      shortageRoutes);
app.use("/api/certificate",   certificateRoutes);
app.use("/api/chat",          chatRoutes);
app.use("/api/analytics",     analyticsRoutes);
app.get("/api/health", (_, res) => res.json({ status:"ok", version:"2.0" }));

io.on("connection", (socket) => {
  // User joins their personal room (for notifications)
  socket.on("join", (userId) => {
    socket.join(userId);
    socket.userId = userId;
  });

  // Feature 1: join chat room for a donation
  socket.on("join_chat", (donationId) => {
    socket.join(`chat_${donationId}`);
  });

  socket.on("leave_chat", (donationId) => {
    socket.leave(`chat_${donationId}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🩸 BloodConnect server running on port ${PORT}`);
  startCronJobs();
});
