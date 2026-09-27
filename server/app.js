import express from "express";
import { createJioSaavnProvider } from "./music/JioSaavnProvider.js";

const VERCEL_AUDIO_CHUNK_BYTES = 4_000_000;
const app = express();
const provider = createJioSaavnProvider({
  baseUrl: process.env.SAAVN_API_BASE || "https://saavan-api-psi.vercel.app"
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept,Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Type,Content-Length,Content-Range,Accept-Ranges");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ ok: true, name: "Saanjh Music API", provider: provider.name });
});

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
  let reader;
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

    const requestedRange = String(req.headers.range || "");
    const upstreamRange = process.env.VERCEL
      ? boundedRange(requestedRange, VERCEL_AUDIO_CHUNK_BYTES)
      : requestedRange;
    const upstreamHeaders = {
      accept: "audio/*,*/*;q=0.9",
      "user-agent": "SaanjhMusic/1.0"
    };
    if (upstreamRange) upstreamHeaders.range = upstreamRange;

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

    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
    copyHeader(upstream, res, "content-length", "Content-Length");
    copyHeader(upstream, res, "content-range", "Content-Range");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");

    reader = upstream.body.getReader();
    req.on("close", () => reader?.cancel().catch(() => {}));
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (error) {
    await reader?.cancel().catch(() => {});
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.status(502).json({ ok: false, error: error.message });
  }
});

function boundedRange(header, maxBytes) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return `bytes=0-${maxBytes - 1}`;

  const [, rawStart, rawEnd] = match;
  if (!rawStart) {
    const suffixLength = Math.min(Number(rawEnd) || maxBytes, maxBytes);
    return `bytes=-${suffixLength}`;
  }

  const start = Number(rawStart);
  const requestedEnd = rawEnd ? Number(rawEnd) : start + maxBytes - 1;
  const end = Math.min(requestedEnd, start + maxBytes - 1);
  return `bytes=${start}-${end}`;
}

function copyHeader(source, target, sourceName, targetName) {
  const value = source.headers.get(sourceName);
  if (value) target.setHeader(targetName, value);
}

export default app;
