const fs = require('fs');
const path = require('path');

const usernamesFile = path.join(__dirname, '..', 'usernames.json');

module.exports = (ADMIN_API_SECRET) => {
  return (req, res) => {
    const secret = req.headers['x-fatcoin-secret'];
    if (secret !== ADMIN_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { username, amount } = req.body;

    if (!username || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    let balances = {};
    try {
      balances = JSON.parse(fs.readFileSync(usernamesFile));
    } catch {
      // No file, start fresh
      balances = {};
    }

    if (!balances[username]) {
      balances[username] = 0;
    }

    balances[username] += parseFloat(amount);

    fs.writeFileSync(usernamesFile, JSON.stringify(balances, null, 2));

    console.log(`✅ Added ${amount} FatCoins to ${username}. New balance: ${balances[username]}`);

    res.json({
      message: `Added ${amount} FatCoins to ${username}. New balance: ${balances[username]}`
    });
  };
};
