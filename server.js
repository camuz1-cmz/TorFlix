process.on('uncaughtException', err => { 
  console.error('CRASH:', err); 
  process.exit(1); 
});

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const TORBOX_BASE = 'https://api.torbox.app/v1/api';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.all('/proxy/*', async (req, res) => {
  const endpoint = req.path.replace('/proxy', '');
  const url = new URL(TORBOX_BASE + endpoint);
  Object.entries(req.query).forEach(([k, v]) => url.searchParams.set(k, v));
  const apiKey = req.headers['x-torbox-key'];
  if (!apiKey) return res.status(401).json({ error: 'API Key ausente' });
  try {
    const fetchRes = await fetch(url.toString(), {
      method: req.method,
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    const data = await fetchRes.json();
    res.status(fetchRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/stream', (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send('URL obrigatória');
  res.writeHead(200, { 'Content-Type': 'video/mp4', 'Transfer-Encoding': 'chunked' });
 const ffmpeg = spawn('ffmpeg', [
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-i', videoUrl,
    '-ss', '0',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-profile:v', 'baseline', '-level', '3.1',
    '-vf', 'scale=1280:720',
    '-b:v', '2500k',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
]);
  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on('data', d => console.log('ffmpeg:', d.toString()));
  ffmpeg.on('error', err => { console.error(err); res.end(); });
  ffmpeg.on('close', () => res.end());
  req.on('close', () => ffmpeg.kill());
});

app.get('/tmdb', async (req, res) => {
  const { title, type, tmdb_key } = req.query;
  if (!title || !tmdb_key) return res.json({ poster: null, overview: null });
  const clean = title.replace(/\.(mkv|mp4|avi|mov)$/i, '').replace(/[\._]/g, ' ').replace(/\s*\(?\d{4}\)?\s*.*/g, '').trim();
  const mediaType = type === 'series' ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${tmdb_key}&query=${encodeURIComponent(clean)}&language=pt-BR`;
  try {
    const r = await fetch(url);
    const data = await r.json();
    const result = data.results?.[0];
    if (!result) return res.json({ poster: null, overview: null });
    res.json({
      poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
      overview: result.overview || null,
      title: result.title || result.name || null
    });
  } catch(e) {
    res.json({ poster: null, overview: null });
  }
});

app.get('/hls', (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) return res.status(400).send('URL obrigatória');
  const streamSrc = `/stream?url=${encodeURIComponent(videoUrl)}`;
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}
video{width:100vw;height:100vh}
</style>
</head>
<body>
<video controls autoplay playsinline preload="auto">
  <source src="${streamSrc}" type="video/mp4">
</video>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TorboxFlix rodando na porta ${PORT}`);
});
