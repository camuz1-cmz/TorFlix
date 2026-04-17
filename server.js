process.on('uncaughtException', err => { 
  console.error('CRASH:', err); 
  process.exit(1); 
});

const express = require('express');
const path = require('path');
const { spawn } = require('child_process'); // 👈 IMPORTANTE

const app = express();
const PORT = process.env.PORT || 3000;
const TORBOX_BASE = 'https://api.torbox.app/v1/api';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Proxy Torbox
app.all('/proxy/*', async (req, res) => {
  const endpoint = req.path.replace('/proxy', '');
  const url = new URL(TORBOX_BASE + endpoint);

  Object.entries(req.query).forEach(([k, v]) => url.searchParams.set(k, v));

  const apiKey = req.headers['x-torbox-key'];
  if (!apiKey) return res.status(401).json({ error: 'API Key ausente' });

  try {
    const fetchRes = await fetch(url.toString(), {
      method: req.method,
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    const data = await fetchRes.json();
    res.status(fetchRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 🎬 ROTA DE STREAM (ESSA É A PARTE QUE FALTAVA)
app.get('/stream', (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).send('URL obrigatória');
  }

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Transfer-Encoding': 'chunked'
  });

  const ffmpeg = spawn('ffmpeg', [
    '-headers', `User-Agent: Mozilla/5.0\r\n`,
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', videoUrl,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov',
    'pipe:1'
  ]);

  ffmpeg.stdout.pipe(res);

  ffmpeg.stderr.on('data', (data) => {
    console.log('FFmpeg:', data.toString());
  });

  ffmpeg.on('error', (err) => {
    console.error('Erro FFmpeg:', err);
    res.status(500).end('Erro no streaming');
  });

  ffmpeg.on('close', () => {
    res.end();
  });
});


// 🚀 START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎬 TorboxFlix rodando na porta ${PORT}`);
});
