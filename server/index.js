import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJioSaavnProvider } from "./music/JioSaavnProvider.js";

const app = express();
const port = Number(process.env.PORT || 4177);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const provider = createJioSaavnProvider({
  baseUrl: process.env.SAAVN_API_BASE || "https://saavan-api-psi.vercel.app"
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, provider: provider.name });
});

app.get("/api/music/search", async (req, res) => {
  try {
    const query = String(req.query.query || "");
    const language = String(req.query.language || "auto");
    const songs = await provider.searchSongs({ query, language, limit: Number(req.query.limit || 12) });
    res.json({ ok: true, songs });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

app.get("/api/music/song/:id", async (req, res) => {
  try {
    const song = await provider.getSong(req.params.id);
    res.json({ ok: true, song });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

app.get("/api/music/recommendations", async (req, res) => {
  try {
    const mood = String(req.query.mood || "late-night");
    const language = String(req.query.language || "auto");
    const limit = Number(req.query.limit || 18);
    const songs = await provider.getRecommendations({ mood, language, limit });
    res.json({ ok: true, songs });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

app.get("/api/music/stream", async (req, res) => {
  try {
    const id = String(req.query.id || "");
    const song = await provider.getSong(id);
    const streamUrl = provider.getStreamUrl(song);
    if (!streamUrl) {
      res.status(404).json({ ok: false, error: "No playable stream URL found for this song." });
      return;
    }
    res.json({ ok: true, streamUrl });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
});

const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));
app.get("*splat", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Night Drive API listening at http://localhost:${port}`);
});
