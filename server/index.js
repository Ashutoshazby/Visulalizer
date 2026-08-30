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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept,Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Type,Content-Length,Content-Range,Accept-Ranges");
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
    if (!id) {
      res.status(400).json({ ok: false, error: "Missing song id." });
      return;
    }

    const song = await provider.getSong(id);
    const streamUrl = provider.getStreamUrl(song);
    if (!streamUrl) {
      res.status(404).json({ ok: false, error: "No playable stream URL found for this song." });
      return;
    }

    const upstreamHeaders = {
      accept: req.headers.range ? "*/*" : "audio/*,*/*;q=0.9",
      "user-agent": "NightDriveRadio/1.0"
    };
    if (req.headers.range) upstreamHeaders.range = req.headers.range;

    const upstream = await fetch(streamUrl, { headers: upstreamHeaders });
    if (!upstream.ok && upstream.status !== 206) {
      res.status(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502).json({
        ok: false,
        error: `Audio provider returned HTTP ${upstream.status}.`
      });
      return;
    }
    if (!upstream.body) {
      res.status(502).json({ ok: false, error: "Audio provider returned an empty stream." });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "audio/mpeg";
    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
    copyHeader(upstream, res, "content-length", "Content-Length");
    copyHeader(upstream, res, "content-range", "Content-Range");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const reader = upstream.body.getReader();
    req.on("close", () => reader.cancel().catch(() => {}));
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.status(502).json({ ok: false, error: error.message });
  }
});

function copyHeader(source, target, sourceName, targetName) {
  const value = source.headers.get(sourceName);
  if (value) target.setHeader(targetName, value);
}

const distPath = path.resolve(__dirname, "../dist");
app.use(express.static(distPath));
app.get("*splat", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`Night Drive API listening at http://localhost:${port}`);
});
