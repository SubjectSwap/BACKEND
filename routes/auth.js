const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier'); // Add this at the top
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { tempUsers, permanentUsers } = require('../cache/tempUsers');
const sendEmail = require('../utils/sendEmail');
const jwt = require('jsonwebtoken');
const { signedCookies } = require('cookie-parser');
const multer = require('multer'); // multer middleware for handling multipart/form-data (image upload)
const path = require('path'); // path module for handling file paths
const {IncorrectProfilePicFileType} = require('../errors/incorrect_profilepic_file_type_error');
const {unitSubjectVectorEmbeddings} = require('../constants/vectorEmbeddings');


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
// Configure cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});


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

  const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  await sendEmail(email, 'Reset your password', `<h2>Click to reset: <a href="${resetLink}">${resetLink}</a></h2><br />This link expires in 15 minutes.`);
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
router.put('/edit-profile', async (req, res) => {
  try {
    // Placeholder for user authentication
    // const userId = req.user.id; // Assuming user ID is available after auth middleware
    const token = req.cookies.SubjectSwapLoginJWT; // For now, get userId from request body for demo
    let userId;
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) =>{
      if (err) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      userId = decoded.userId;
    });
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' }); // userId validation
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' }); // user existence check

    // Update user info fields if provided
    const { username, description, languages, learningSubjects, teachingSubjects, fileObject } = req.body;
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
    user.learningSubjects = learningSubjects; // update learningSubjects
    // update teaching subjects. teachingSubjects has the schema [{subjectName: String, subjectRating: Number}]
    // But first we need to go though all existing subjects in user.teachingSubjects teachingSubjects: [{
  //   subjectVector: [Number],
  //   subjectName: String,
  //   selfRating: Number,
  //   noOfRatings: Number, // Total no of ratings
  //   totalReceivedRatings: Number, // Sum of all ratings
  //   active: { type: Boolean, default: true }
  // }]
    // If a subject.subjectName is present in teachingSubjects, set subject.active: true, subject.selfRating: teachingSubjects.subject.subjectRating.
    // If a subject.subjectName is not present in teachingSubjects, set subject.active: false
    // If a subject is present in teachingSubjects but not in user.teachingSubjects, append {
  //    subjectName: teachingSubjects.subject.subjectName,
  //    subjectVector: unitSubjectVectorEmbeddings[teachingSubjects.subject.subjectName],
  //    selfRating: teachingSubjects.subject.subjectRating,
  //    noOfRatings: 0,
  //    totalReceivedRatings: 0,
  //    active: true
  //}
    // If a subject is present in user.teachingSubjects but not in teachingSubjects, set subject.active: false

    user.teachingSubjects = user.teachingSubjects.map(subject => {
      const teachingSubject = teachingSubjects.find(teachingSubject => teachingSubject.subjectName === subject.subjectName);
      if (teachingSubject) {
        subject.active = true;
        subject.selfRating = teachingSubject.subjectRating;
      } else {
        subject.active = false;
      }
      return subject;
    })
    // Append new subjects if they are not present in user.teachingSubjects
    teachingSubjects.forEach(teachingSubject => {
      const existingSubject = user.teachingSubjects.find(subject => subject.subjectName === teachingSubject.subjectName);
      if (!existingSubject) {
        user.teachingSubjects.push({
          subjectName: teachingSubject.subjectName,
          subjectVector: unitSubjectVectorEmbeddings[teachingSubject.subjectName],
          selfRating: teachingSubject.selfRating,
          noOfRatings: 0,
          totalReceivedRatings: 0,
          active: true
        });
      }
    });

    // Update profilePicUrl if image uploaded
    if (fileObject) {
      const ext = fileObject.filedata.name.split('.').pop().toLowerCase();
      const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);

      // If not an image
      if (!isImage) throw new IncorrectProfilePicFileType();
      const uuid = uuidv4();
      const uploadFromBuffer = () => {
          return new Promise((resolve, reject) => {
              const publicId = `profile_pic/${uuid}.${ext}`;
              const uploadStream = cloudinary.uploader.upload_stream(
                  {
                      resource_type: 'image',
                      public_id: publicId,
                      use_filename: true,
                      unique_filename: false,
                      overwrite: true
                  },
                  (error, result) => {
                      if (error) return reject(error);
                      resolve(result);
                  }
              );
              streamifier.createReadStream(fileObject.buffer).pipe(uploadStream);
          });
      };
      const result = await uploadFromBuffer();
      user.profilePicUrl = result.secure_url; // save uploaded image path
    }

    await user.save(); // save updated user document

    res.json({ message: 'Profile updated successfully', user }); // success response
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' }); // error handling
  }
});
module.exports = router;