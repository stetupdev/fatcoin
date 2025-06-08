const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

class FatCoinChain {
  constructor() {
    this.chain = [];
    this.pendingTransactions = [];
    this.usernameRegistry = {};
    this.registryFile = path.join(__dirname, 'usernames.json');

    this.loadUsernameRegistry();
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

  registerUsername(username, ethAddress) {
    if (this.usernameRegistry[username]) {
      return false; // username taken
    }
    this.usernameRegistry[username] = ethAddress;
    this.saveUsernameRegistry();
    return true;
  }

  resolveAddress(address) {
    if (address.endsWith('@ftc')) {
      const username = address.split('@')[0];
      return this.usernameRegistry[username] || null;
    }
    return address;
  }

  addTransaction(transaction) {
    const senderResolved = this.resolveAddress(transaction.sender);
    const recipientResolved = this.resolveAddress(transaction.recipient);

    if (!senderResolved || !recipientResolved) {
      return false; // invalid address
    }

    this.pendingTransactions.push({
      sender: senderResolved,
      recipient: recipientResolved,
      amount: transaction.amount,
      timestamp: Date.now(),
    });

    return true;
  }
}

const app = express();
app.use(bodyParser.json());

const fatcoin = new FatCoinChain();

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

app.post('/transaction/send', (req, res) => {
  const { sender, recipient, amount } = req.body;
  if (!sender || !recipient || typeof amount !== 'number') {
    return res.status(400).json({ message: 'Missing sender, recipient or amount' });
  }

  const success = fatcoin.addTransaction({ sender, recipient, amount });
  if (!success) {
    return res.status(400).json({ message: 'Invalid sender or recipient address' });
  }

  return res.json({ message: 'Transaction added', transaction: { sender, recipient, amount } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FatCoin node running on port ${PORT}`);
});
