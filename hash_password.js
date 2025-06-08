const bcrypt = require('bcrypt');
const readline = require('readline');

const SALT_ROUNDS = 10;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter password to hash: ', async (password) => {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  console.log('Hashed password:', hash);
  rl.close();
});
