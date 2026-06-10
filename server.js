import 'dotenv/config';
import express from 'express';
import Docker from 'dockerode';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const LOG_LINES = parseInt(process.env.LOG_LINES ?? '50', 10);
const PORT = parseInt(process.env.PORT ?? '3001', 10);

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.get('/api/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const result = containers.map(c => ({
      id: c.Id,
      name: c.Names[0].replace(/^\//, ''),
      image: c.Image,
      status: c.Status,
      state: c.State,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function fetchLogs(containerId) {
  const container = docker.getContainer(containerId);
  const stream = await container.logs({
    stdout: true,
    stderr: true,
    tail: LOG_LINES,
    timestamps: false,
  });
  // Docker multiplexes stdout/stderr with an 8-byte header; strip it
  const raw = stream.toString('utf8');
  return raw
    .split('\n')
    .map(line => (line.length > 8 ? line.slice(8) : line))
    .join('\n')
    .trim();
}

app.get('/api/containers/:id/logs', async (req, res) => {
  try {
    const logs = await fetchLogs(req.params.id);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/containers/:id/analyze', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const info = containers.find(c => c.Id === req.params.id || c.Id.startsWith(req.params.id));
    const name = info ? info.Names[0].replace(/^\//, '') : req.params.id;
    const logs = await fetchLogs(req.params.id);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system:
        'You are a DevOps assistant. Analyze the provided Docker container logs and identify errors, warnings, anomalies, performance issues, and anything requiring attention. Be concise and actionable. Use markdown formatting with headers and bullet points.',
      messages: [
        {
          role: 'user',
          content: `Container: ${name}\n\nLogs (last ${LOG_LINES} lines):\n\`\`\`\n${logs}\n\`\`\``,
        },
      ],
    });

    res.json({ analysis: message.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Docker Log Viewer running on http://localhost:${PORT}`);
});
