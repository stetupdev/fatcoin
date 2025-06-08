const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

class FatBlock {
  constructor(index, transactions, timestamp, previousHash, nonce = 0) {
    this.index = index;
    this.transactions = transactions;
    this.timestamp = timestamp;
    this.previousHash = previousHash;
    this.nonce = nonce;
    this.hash = this.computeHash();
  }

  computeHash() {
    return crypto.createHash('sha256')
      .update(JSON.stringify({
        index: this.index,
        transactions: this.transactions,
        timestamp: this.timestamp,
        previousHash: this.previousHash,
        nonce: this.nonce
      }))
      .digest('hex');
  }
}

class FatCoinChain {
  constructor() {
    this.difficulty = 4;
    this.chain = [];
    this.unconfirmedTransactions = [];
    this.nodes = new Set();
    this.usernameRegistry = {}; // username -> ethereum address mapping
    this.createGenesisBlock();
  }

  createGenesisBlock() {
    const genesisBlock = new FatBlock(0, [], Date.now(), "0");
    this.chain.push(genesisBlock);
  }

  getLastBlock() {
    return this.chain[this.chain.length - 1];
  }

  registerNode(address) {
    this.nodes.add(address);
  }

  registerUsername(username, ethAddress) {
    if (this.usernameRegistry[username]) {
      return false; // already taken
    }
    this.usernameRegistry[username] = ethAddress;
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
      throw new Error('Invalid sender or recipient address');
    }

    this.unconfirmedTransactions.push({
      sender: senderResolved,
      recipient: recipientResolved,
      amount: transaction.amount
    });
  }

  proofOfWork(block) {
    while (!block.hash.startsWith('0'.repeat(this.difficulty))) {
      block.nonce++;
      block.hash = block.computeHash();
    }
    return block.hash;
  }

  addBlock(block, proof) {
    const lastHash = this.getLastBlock().hash;
    if (lastHash !== block.previousHash) return false;
    if (!this.isValidProof(block, proof)) return false;

    block.hash = proof;
    this.chain.push(block);
    return true;
  }

  isValidProof(block, hash) {
    return hash.startsWith('0'.repeat(this.difficulty)) && hash === block.computeHash();
  }

  mine() {
    if (this.unconfirmedTransactions.length === 0) return false;

    const lastBlock = this.getLastBlock();
    const newBlock = new FatBlock(
      lastBlock.index + 1,
      this.unconfirmedTransactions,
      Date.now(),
      lastBlock.hash
    );

    const proof = this.proofOfWork(newBlock);
    this.addBlock(newBlock, proof);
    this.unconfirmedTransactions = [];
    return newBlock;
  }

  isChainValid(chain) {
    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      const prevBlock = chain[i - 1];

      if (block.previousHash !== prevBlock.hash) return false;
      if (block.hash !== block.computeHash()) return false;
      if (!block.hash.startsWith('0'.repeat(this.difficulty))) return false;
    }
    return true;
  }

  async resolveConflicts() {
    const neighbours = Array.from(this.nodes);
    let newChain = null;
    let maxLength = this.chain.length;

    for (const node of neighbours) {
      try {
        const response = await axios.get(`${node}/chain`);
        if (response.status === 200) {
          const length = response.data.length;
          const chain = response.data.chain;

          if (length > maxLength && this.isChainValid(chain)) {
            maxLength = length;
            newChain = chain;
          }
        }
      } catch (err) {
        console.log(`Could not get chain from node ${node}: ${err.message}`);
      }
    }

    if (newChain) {
      this.chain = newChain.map(b => Object.assign(new FatBlock(), b));
      return true;
    }
    return false;
  }
}

const fatcoin = new FatCoinChain();

// Routes

// Get full blockchain
app.get('/chain', (req, res) => {
  res.json({
    length: fatcoin.chain.length,
    chain: fatcoin.chain
  });
});

// Add new transaction
app.post('/transactions/new', (req, res) => {
  const { sender, recipient, amount } = req.body;
  if (!sender || !recipient || !amount) {
    return res.status(400).json({ message: 'Missing transaction fields' });
  }

  try {
    fatcoin.addTransaction({ sender, recipient, amount });
    res.json({ message: 'Transaction added to mempool' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Mine a block
app.get('/mine', (req, res) => {
  const block = fatcoin.mine();
  if (!block) {
    return res.json({ message: 'No transactions to mine' });
  }
  res.json({
    message: 'New FatBlock mined',
    index: block.index,
    hash: block.hash,
    transactions: block.transactions
  });
});

// Register new nodes (accepts array of node URLs)
app.post('/nodes/register', (req, res) => {
  const { nodes } = req.body;
  if (!nodes || !Array.isArray(nodes)) {
    return res.status(400).json({ message: 'Invalid nodes list' });
  }

  nodes.forEach(node => fatcoin.registerNode(node));
  res.json({ message: 'New nodes added', totalNodes: Array.from(fatcoin.nodes) });
});

// Consensus algorithm - resolve conflicts
app.get('/nodes/resolve', async (req, res) => {
  const replaced = await fatcoin.resolveConflicts();
  if (replaced) {
    res.json({ message: 'Our chain was replaced', newChain: fatcoin.chain });
  } else {
    res.json({ message: 'Our chain is authoritative', chain: fatcoin.chain });
  }
});

// Register username to Ethereum address
app.post('/user/register', (req, res) => {
  const { username, ethAddress } = req.body;
  if (!username || !ethAddress) {
    return res.status(400).json({ message: 'Missing username or Ethereum address' });
  }

  const success = fatcoin.registerUsername(username, ethAddress);
  if (!success) {
    return res.status(409).json({ message: 'Username already taken' });
  }

  res.json({ message: `Username ${username}@ftc registered to ${ethAddress}` });
});

app.listen(PORT, () => {
  console.log(`FatCoin node running on port ${PORT}`);
});
