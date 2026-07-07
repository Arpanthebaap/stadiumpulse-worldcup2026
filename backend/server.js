import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import apiRouter from "./routes/api.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;

// Security: modest body size limit, CORS restricted to configured origin(s) only.
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",");
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "50kb" }));

app.use("/api", apiRouter);

app.get("/", (req, res) => {
  res.json({ service: "StadiumPulse API", status: "running" });
});

// Basic error handler so unhandled errors never leak stack traces to clients.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`StadiumPulse backend listening on http://localhost:${PORT}`);
});
