const knex = require('../db/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET; // This must be a secure, secret key

async function register(req, res) {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Hash the password before storing it
  const password_hash = await bcrypt.hash(password, 10);

  try {
    const [newUser] = await knex('users').insert({
      username,
      email,
      password_hash
    }).returning(['id', 'username', 'email']);

    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: 'Error registering new user.' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await knex('users').where({ email }).first();

  if (user && await bcrypt.compare(password, user.password_hash)) {
    // Passwords match, generate a token
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials.' });
  }
}

module.exports = { register, login };