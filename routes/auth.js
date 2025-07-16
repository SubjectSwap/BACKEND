const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const tempUsers = require('../tempUsers');
const sendEmail = require('../utils/sendEmail');

// POST /create-account
router.post('/create-account', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });

  const passwordHash = await bcrypt.hash(password, 10);
  const uuid = uuidv4();

  tempUsers.set(uuid, { username, email, passwordHash });

  const verifyLink = `http://localhost:3000/verify-account/${uuid}`;
  await sendEmail(email, 'Verify your account', `Click this link: ${verifyLink}`);

  res.json({ message: 'Verification email sent' });
});

// POST /verify-account/:uuid
router.post('/verify-account/:uuid', async (req, res) => {
  const { uuid } = req.params;
  if (!tempUsers.has(uuid))
    return res.status(400).json({ error: 'Invalid or expired link' });

  const userData = tempUsers.get(uuid);
  const newUser = new User(userData);
  await newUser.save();

  tempUsers.delete(uuid);

  res.json({ message: 'Account created successfully' });
});

module.exports = router;
