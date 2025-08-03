const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { tempUsers, permanentUsers } = require('../cache/tempUsers');
const sendEmail = require('../utils/sendEmail');
const jwt = require('jsonwebtoken');
const { signedCookies } = require('cookie-parser');
const multer = require('multer'); // multer middleware for handling multipart/form-data (image upload)
const path = require('path'); // path module for handling file paths


//Multer setup for image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); // folder to save uploaded images
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // unique filename with extension
  }
});
const upload = multer({ storage: storage }); // multer instance configured with storage


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
    existingUser = await User.findOne({ email, active: true }).exec();
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
    await sendEmail(email, 'Verify your account', `<h2>Click this link: <a href="${verifyLink}">${verifyLink}</a></h2><br/>This link expires in ${unregisteredUsers / (60 * 1000)} minutes`);
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
    user = await User.findOne({ email, active: true }).exec();
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

  user.passwordHash = undefined; // Remove password hash from user object
  user.email = undefined; // Remove email from user object for security
  user._id = null; // Remove _id from user object for security
  res.status(200).cookie("SubjectSwapLoginJWT", token, { 
    httpOnly: true, 
    secure: true, 
    sameSite: 'None', 
    maxAge: 30 * 24 * 60 * 60 * 1000, 
    accessControlAllowCredentials: true,
    path: '/*'
  }).json({ message: 'Logged in successfully', user, token });
});

// POST /verify-user - used to verify the user after login
router.post('/verify-user', async (req, res) => {
  // console.log(req);
  const token = req.cookies.SubjectSwapLoginJWT;
  // console.log(token);

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
    user.passwordHash = undefined; // Remove password hash from user object
    user._id = null; // Remove _id from user object for security
    user.email = undefined; // Remove email from user object for security
    // Return the user object with a success message
    res.json({ message: 'User verified successfully', user });
  } catch (error) {
    console.error('Failed to verify account:', error);
    res.status(500).json({ message: 'Failed to verify account' });
  }
});

//FORGET PASSWORD
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status()
  const user = await User.findOne({ email });

  if (!user) return res.status(404).json({ message: 'User not found' });

  const resetToken = uuidv4();
  user.resetToken = resetToken;
  user.resetTokenExpiry = Date.now() + 1000 * 60 * 15; // 15 min
  await user.save();

  const resetLink = `http://localhost:3000/reset-password/${resetToken}`;

  await sendEmail(email, 'Reset your password', `Click to reset: ${resetLink}`);
  res.json({ message: 'Password reset link sent' });
});

// POST /reset-password/:token
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpiry: { $gt: Date.now() }
  });

  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.passwordHash = hashedPassword;
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  await user.save();

  res.json({ message: 'Password reset successful' });
});

// PUT /edit-profile
// Note: Add authentication middleware as needed
router.put('/edit-profile', upload.single('profilePic'), async (req, res) => {
  try {
    // Placeholder for user authentication
    // const userId = req.user.id; // Assuming user ID is available after auth middleware
    const userId = req.body.userId; // For now, get userId from request body for demo

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' }); // userId validation
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' }); // user existence check

    // Update user info fields if provided
    const { username, description, languages } = req.body;
    if (username) user.username = username; // update username
    if (description) user.description = description; // update description
    if (languages) {
      if (typeof languages === 'string') {
        // If languages is a JSON string, parse it
        try {
          user.languages = JSON.parse(languages);
        } catch {
          user.languages = languages.split(',').map(lang => lang.trim()); // parse comma separated string
        }
      } else if (Array.isArray(languages)) {
        user.languages = languages; // update languages array
      }
    }

    // Update profilePicUrl if image uploaded
    if (req.file) {
      user.profilePicUrl = `/uploads/${req.file.filename}`; // save uploaded image path
    }

    await user.save(); // save updated user document

    res.json({ message: 'Profile updated successfully', user }); // success response
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' }); // error handling
  }
});
module.exports = router;