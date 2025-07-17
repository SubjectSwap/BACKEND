const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { tempUsers, permanentUsers } = require('../cache/tempUsers');
const sendEmail = require('../utils/sendEmail');
const jwt = require('jsonwebtoken');
const { signedCookies } = require('cookie-parser');

// Email validation regex
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;

// POST /create-account
router.post('/create-account', async (req, res) => {
  const { username, email, password } = req.body;

  // Check if all fields are provided
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  // Validate email format
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  let existingUser;

  const inCache = tempUsers.checkMail(email);
  if(inCache) {
    return res.status(409).json({ message: `Email already in a session. Try ${tempUsers.timeout / (60*1000)} minutes later.` });
  }

  try {
    // Check if email already exists in the database
    existingUser = await User.findOne({ email }).exec();
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ message: 'Database error occurred' });
  }

  if (existingUser) {
    return res.status(409).json({ message: 'Email already in use' });
  }

  // Hash the password
  const passwordHash = await bcrypt.hash(password, 10);
  const uuid = uuidv4();

  // Store the temporary user data
  tempUsers.set(uuid, { username, email, passwordHash });

  // Create verification link
  const verifyLink = `${process.env.FRONTEND_URL}/verify-account/${uuid}`;
  const { unregisteredUsers } = require('../constants/cronJobTimers');

  try {
    // Send verification email
    await sendEmail(email, 'Verify your account', `<h2>Click this link: ${verifyLink}</h2><br/>This link expires in ${unregisteredUsers / (60 * 1000)} minutes`);
    res.json({ message: 'Verification email sent', time_left: unregisteredUsers / (60 * 1000) });
  } catch (error) {
    console.error('Failed to send email:', error);
    res.status(500).json({ message: 'Failed to send verification email' });
  }
});

// POST /verify-account/:uuid
router.post('/verify-account/:uuid', async (req, res) => {
  const { uuid } = req.params;

  // Check if the UUID is valid and user exists in tempUsers
  if (!tempUsers.has(uuid)) {
    return res.status(400).json({ message: 'Invalid or expired link' });
  }

  const { username, email, passwordHash } = tempUsers.get(uuid);

  // Create a new user in the database
  try {
    const newUser = new User({ username, email, passwordHash });
    await newUser.save();
    tempUsers.delete(uuid);
    res.status(200).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('Failed to create user:', error);
    res.status(500).json({ message: 'Failed to create account' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Check if all fields are provided
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  let user;
  try {
    // Find the user by email
    user = await User.findOne({ email }).exec();
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ message: 'Database error occurred' });
  }

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Compare the provided password with the stored hash
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // Generate a JWT token
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

  // Store the token in the permanentUsers map
  // const uuid = uuidv4();
  // permanentUsers.set(uuid, { token, timestamp: Date.now() });
  console.log(token);
  console.log(user._id);

  // Set the JWT token as a cookie
  // res.;

  res.status(200).cookie("SubjectSwapLoginJWT", token, { 
    httpOnly: true, 
    secure: true, 
    sameSite: 'none', 
    maxAge: 30 * 24 * 60 * 60 * 1000, 
    accessControlAllowCredentials: true,
    secret: process.env.JWT_SECRET,
    signedCookies: true
  
  }).json({ message: 'Logged in successfully', user });
});

// POST /verify-user
router.post('/verify-user', async (req, res) => {
  console.log(req);
  const token = req.cookies["SubjectSwapLoginJWT"];

  // Check if the token is provided
  if (!token) {
    return res.status(401).json({ message: 'JWT token is missing' });
  }

  try {
    // Verify and decode the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user by ID
    const user = await User.findById(decoded.userId).exec();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Return the user object with a success message
    res.json({ message: 'User verified successfully', user });
  } catch (error) {
    console.error('Failed to verify account:', error);
    res.status(500).json({ message: 'Failed to verify account' });
  }
});

module.exports = router;