const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, unique: true },
  passwordHash: String,
  profilePicUrl: { type: String, default: null },
  description: String,
  languages: [String],
  teachingSubjects: [{
    subjectVector: [Number],
    selfRating: Number,
    noOfRatings: Number,
    totalReceivedRatings: Number,
    active: { type: Boolean, default: true }
  }],
  learningSubjects: [String],
  personalityRating: {
    average: Number,
    totalRatings: Number
  },
  active: { type: Boolean, default: true }
});

module.exports = mongoose.model('User', userSchema);
