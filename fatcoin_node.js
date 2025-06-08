const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

class FatCoinChain {
  constructor() {
    this.chain = [];
    this.pendingTransactions = [];
    this.usernameRegistry = {};
    this.balances = {};
    this.registryFile = path.join(__dirname, 'usernames.json');
    this.balancesFile = path.join(__dirname, 'balances.json');

    this.loadUsernameRegistry();
    this.loadBalances();
  }

  loadUsernameRegistry() {
    if (fs.existsSync(this.registryFile)) {
      const data = fs.readFileSync(this.registryFile, 'utf8');
      this.usernameRegistry = JSON.parse(data);
      console.log('Loaded username registry:', this.usernameRegistry);
    }
  }

  saveUsernameRegistry() {
    fs.writeFileSync(this.registryFile, JSON.stringify(this.usernameRegistry, null, 2));
  }

  loadBalances() {
    if (fs.existsSync(this.balancesFile)) {
      const data = fs.readFileSync(this.balancesFile, 'utf8');
      this.balances = JSON.parse(data);
      console.log('Loaded balances:', this.balances);
    }
  }

  saveBalances() {
    fs.writeFileSync(this.balancesFile, JSON.stringify(this.balances, null, 2));
  }

  registerUsername(username, ethAddress) {
    if (this.usernameRegistry[username]) {
      return false; // username taken
    }
    this.usernameRegistry[username] = ethAddress;
    this.saveUsernameRegistry();

    // Initialize balance if not existing
    if (!(username in this.balances)) {
      this.balances[username] = 0;
      this.saveBalances();
    }

    return true;
  }

  resolveAddress(address) {
    if (address.endsWith('@ftc')) {
      const username = address.split('@')[0];
      return this.usernameRegistry[username] || null;
    }
    return address;
  }

  getBalanceByAddress(address) {
    // If address is an ethAddress (not username), just return 0 (or handle differently)
    // For now, we track balances by username only
    if (address.endsWith('@ftc')) {
      const username = address.split('@')[0];
      return this.balances[username] || 0;
    }
    return 0;
  }

  addTransaction(transaction) {
    const senderResolved = transaction.sender;
    const recipientResolved = transaction.recipient;

    // Resolve if username@ftc format
    const senderUsername = senderResolved.endsWith('@ftc') ? senderResolved.split('@')[0] : null;
    const recipientUsername = recipientResolved.endsWith('@ftc') ? recipientResolved.split('@')[0] : null;

    // Validate sender exists and has balance
    if (senderUsername) {
      if (!(senderUsername in this.balances)) return false; // sender unknown
      if (this.balances[senderUsername] < transaction.amount) return false; // insufficient funds
    } else {
      // If sender is an ETH address or unknown, reject for now
      return false;
    }

    // Validate recipient exists or create balance entry
    if (recipientUsername && !(recipientUsername in this.balances)) {
      this.balances[recipientUsername] = 0;
    }

    // Deduct sender balance, add recipient balance
    this.balances[senderUsername] -= transaction.amount;

    if (recipientUsername) {
      this.balances[recipientUsername] += transaction.amount;
    }

    // Save balances after the transaction
    this.saveBalances();

    // Add transaction to pending list for future mining (optional)
    this.pendingTransactions.push({
      sender: senderResolved,
      recipient: recipientResolved,
      amount: transaction.amount,
      timestamp: Date.now(),
    });

    return true;
  }

  addBalance(username, amount) {
    if (!this.balances[username]) {
      this.balances[username] = 0;
    }
    this.balances[username] += amount;
    this.saveBalances();
  }
}

const app = express();
app.use(bodyParser.json());

const fatcoin = new FatCoinChain();

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'ChangeThisSecret!';

// User registration
app.post('/user/register', (req, res) => {
  const { username, ethAddress } = req.body;
  if (!username || !ethAddress) {
    return res.status(400).json({ message: 'Missing username or ethAddress' });
  }

  const success = fatcoin.registerUsername(username, ethAddress);
  if (!success) {
    return res.status(409).json({ message: `Username ${username}@ftc is already taken` });
  }
  return res.json({ message: `Username ${username}@ftc registered to ${ethAddress}` });
});

// Send transaction
app.post('/transaction/send', (req, res) => {
  const { sender, recipient, amount } = req.body;
  if (!sender || !recipient || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ message: 'Invalid sender, recipient, or amount' });
  }

  const success = fatcoin.addTransaction({ sender, recipient, amount });
  if (!success) {
    return res.status(400).json({ message: 'Invalid transaction: check balances or addresses' });
  }

  return res.json({ message: 'Transaction successful', transaction: { sender, recipient, amount } });
});

// Admin endpoint to add balance manually (protected by secret)
app.post('/admin/addbalance', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { username, amount } = req.body;
  if (!username || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ message: 'Invalid username or amount' });
  }

  fatcoin.addBalance(username, amount);
  return res.json({ message: `Added ${amount} FatCoin to ${username}` });
});

// Get user balance
app.get('/user/balance/:username', (req, res) => {
  const username = req.params.username;
  if (!(username in fatcoin.balances)) {
    return res.status(404).json({ message: 'User not found' });
  }
  return res.json({ username, balance: fatcoin.balances[username] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FatCoin node running on port ${PORT}`);
});
