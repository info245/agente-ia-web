import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Puerto
const PORT = process.env.PORT || 3000;

// Ruta de salud (health check)
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "agente-ia-web-backend",
    timestamp: new Date().toISOString()
  });
});

// Ruta raíz opcional (útil para probar rápido en navegador)
app.get("/", (req, res) => {
  res.send("Backend del agente IA web activo ✅");
});

// Arranque del servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});
