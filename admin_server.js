const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

const USERS_FILE = path.join(__dirname, 'usernames.json');

// === Config: set your admin password here and generate its hash
const ADMIN_PASSWORD = 'yourAdminPasswordHere'; // CHANGE this!
const SALT_ROUNDS = 10;

// Hash the admin password once (you can pre-generate and paste the hash here for better security)
let adminPasswordHash = '';

bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS).then(hash => {
  adminPasswordHash = hash;
  console.log('Admin password hash set.');
});

// Helper to load users
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

// Helper to save users
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Middleware: simple auth by URL param with hashed password
app.use(async (req, res, next) => {
  // The admin auth hash must be in the path as /admin/:hash
  if (!req.path.startsWith('/admin/')) {
    return res.status(404).send('Not found');
  }
  const hashFromUrl = req.path.split('/')[2];
  if (!hashFromUrl) {
    return res.status(401).send('Unauthorized: missing hash');
  }
  // Compare URL hash param to real admin password hash (bcrypt compare)
  const match = await bcrypt.compare(ADMIN_PASSWORD, hashFromUrl);
  if (!match) {
    return res.status(401).send('Unauthorized: invalid hash');
  }
  next();
});

// Show admin form page
app.get('/admin/:hash', (req, res) => {
  res.send(`
    <h1>FatCoin Admin Panel</h1>
    <form method="POST" action="/admin/${req.params.hash}/add">
      <label>User to add FatCoin to: <input name="username" required></label><br>
      <label>Amount to add: <input name="amount" type="number" required></label><br>
      <button type="submit">Add FatCoin</button>
    </form>
  `);
});

// Handle adding FatCoin
app.post('/admin/:hash/add', (req, res) => {
  const { username, amount } = req.body;
  if (!username || !amount || isNaN(amount)) {
    return res.status(400).send('Invalid input');
  }

  const users = loadUsers();
  if (!users[username]) {
    // Create user if not exists with zero balance
    users[username] = 0;
  }
  users[username] += Number(amount);
  saveUsers(users);

  res.send(`Added ${amount} FatCoin to user ${username}. <a href="/admin/${req.params.hash}">Go back</a>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Admin panel running on port ${PORT}`);
  console.log(`Access URL: http://localhost:${PORT}/admin/{hashedAdminPassword}`);
});
