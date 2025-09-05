const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000; // Render default is 10000

app.use(cors());
app.use(express.json());

const SAVE_DIR = path.join(__dirname, 'saves');
if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR);

function getUserFile(user) {
  const safeUser = user.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(SAVE_DIR, `${safeUser}.json`);
}

// Save endpoint
app.post('/api/game/save', (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).send('Missing user');
  fs.writeFile(getUserFile(user), JSON.stringify(req.body, null, 2), err => {
    if (err) return res.status(500).send('Save failed');
    res.send('OK');
  });
});

// Load endpoint
app.get('/api/game/load', (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).send('Missing user');
  const file = getUserFile(user);
  if (!fs.existsSync(file)) return res.json(null);
  fs.readFile(file, (err, data) => {
    if (err) return res.status(500).send('Read failed');
    res.type('json').send(data);
  });
});

app.get('/api/game/rawsave', (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).json({ error: 'Missing user' });
  const filePath = path.join(__dirname, 'saves', `${user}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Save not found' });
  const data = fs.readFileSync(filePath, 'utf-8');
  res.type('application/json').send(data);
});


app.put('/api/game/rawsave', (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).json({ error: 'Missing user' });
  const newData = req.body;
  if (!newData || typeof newData !== 'object') return res.status(400).json({ error: 'Missing or invalid data' });

  const saveDir = path.join(__dirname, 'saves');
  if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir);

  const filePath = path.join(saveDir, `${user}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2), 'utf-8');
    res.json({ ok: true, message: 'Save file updated.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/game/rawsave', (req, res) => {
  const user = req.query.user;
  if (!user) return res.status(400).json({ error: 'Missing user' });

  const filePath = path.join(__dirname, 'saves', `${user}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Save file not found' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ ok: true, message: 'Save file deleted.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));