// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000; // Render default is 10000

app.use(cors());
app.use(express.json({ limit: '5mb' })); // bump if needed

// ----- Disk-backed save directory -----
// On Render, set FLEX_SAVE_DIR to your disk mount path (e.g. /var/flex-saves)
const SAVE_DIR = process.env.FLEX_SAVE_DIR || path.join(__dirname, 'saves');

// Ensure directory exists (and is writable) at boot
(async () => {
  try {
    await fsp.mkdir(SAVE_DIR, { recursive: true });
    // touch a file to verify writes (and clean it up)
    const probe = path.join(SAVE_DIR, '.write_probe');
    await fsp.writeFile(probe, String(Date.now()), 'utf8');
    await fsp.unlink(probe).catch(() => {});
    console.log('[saves] using directory:', SAVE_DIR);
  } catch (e) {
    console.error('[saves] cannot use directory:', SAVE_DIR, e);
    process.exit(1);
  }
})();

// ----- Helpers -----
function sanitizeUser(user) {
  // keep alnum, underscore, hyphen; cap length
  return String(user).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}
function getUserFile(user) {
  const safeUser = sanitizeUser(user);
  return path.join(SAVE_DIR, `${safeUser}.json`);
}
async function atomicWriteJSON(filePath, dataObj) {
  const tmp = filePath + '.tmp';
  const payload = JSON.stringify(dataObj ?? {}, null, 2);
  await fsp.writeFile(tmp, payload, 'utf8');
  await fsp.rename(tmp, filePath); // atomic replace on same filesystem
}

// ----- API -----

// Save endpoint (game auto-save)
app.post('/api/game/save', async (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).send('Missing user');
  try {
    await atomicWriteJSON(getUserFile(user), req.body);
    res.send('OK');
  } catch (err) {
    console.error('save error', err);
    res.status(500).send('Save failed');
  }
});

// Load endpoint (game auto-load)
app.get('/api/game/load', async (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).send('Missing user');
  const file = getUserFile(user);
  try {
    const exists = fs.existsSync(file);
    if (!exists) return res.json(null);
    const data = await fsp.readFile(file, 'utf8');
    res.type('json').send(data);
  } catch (err) {
    console.error('load error', err);
    res.status(500).send('Read failed');
  }
});

// Raw read (admin)
app.get('/api/game/rawsave', async (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).json({ error: 'Missing user' });
  const filePath = getUserFile(user);
  try {
    await fsp.access(filePath, fs.constants.F_OK);
    const data = await fsp.readFile(filePath, 'utf8');
    res.type('application/json').send(data);
  } catch {
    res.status(404).json({ error: 'Save not found' });
  }
});

// Raw write (admin) – atomic
app.put('/api/game/rawsave', async (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).json({ error: 'Missing user' });
  const newData = req.body;
  if (!newData || typeof newData !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid data' });
  }
  try {
    await atomicWriteJSON(getUserFile(user), newData);
    res.json({ ok: true, message: 'Save file updated.' });
  } catch (e) {
    console.error('rawsave write error', e);
    res.status(500).json({ error: e.message });
  }
});

// Delete (admin)
app.delete('/api/game/rawsave', async (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).json({ error: 'Missing user' });
  const filePath = getUserFile(user);
  try {
    await fsp.unlink(filePath);
    res.json({ ok: true, message: 'Save file deleted.' });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: 'Save file not found' });
    console.error('delete error', e);
    res.status(500).json({ error: e.message });
  }
});

// List all users (files on disk)
app.get('/api/game/list', async (_req, res) => {
  try {
    const files = await fsp.readdir(SAVE_DIR);
    const users = files.filter(f => f.endsWith('.json')).map(f => path.basename(f, '.json'));
    res.json(users);
  } catch (err) {
    console.error('list error', err);
    res.status(500).json({ error: 'Failed to read save directory' });
  }
});

// Optional: quick disk info (handy during setup)
app.get('/api/game/disk-info', async (_req, res) => {
  try {
    const stat = await fsp.stat(SAVE_DIR);
    res.json({ saveDir: SAVE_DIR, exists: true, isDir: stat.isDirectory() });
  } catch {
    res.json({ saveDir: SAVE_DIR, exists: false });
  }
});

// Health
app.get('/api/ping', (_req, res) => res.json({ status: 'ok' }));

// List all files on the save disk (filename, size, mtime)
app.get('/api/game/files', async (_req, res) => {
  try {
    const entries = await fsp.readdir(SAVE_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter(e => e.isFile())
        .map(async e => {
          const filePath = path.join(SAVE_DIR, e.name);
          const stat = await fsp.stat(filePath);
          return {
            name: e.name,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          };
        })
    );
    res.json(files);
  } catch (err) {
    console.error('files list error', err);
    res.status(500).json({ error: 'Failed to read save directory' });
  }
});


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
