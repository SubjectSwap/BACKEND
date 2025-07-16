const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: String,
  email: { type: String, unique: true },
  passwordHash: String,
  profilePicUrl: { type: String, default: null },
  description: String,
  languages: [String],
  teachingSubjects: [{
    subjectId: mongoose.Schema.Types.ObjectId,
    selfRating: Number,
    noOfRatings: Number,
    totalReceivedRatings: Number
  }],
  learningSubjects: [mongoose.Schema.Types.ObjectId],
  personalityRating: {
    average: Number,
    totalRatings: Number
  },
  active: { type: Boolean, default: true }
});

module.exports = mongoose.model('User', userSchema);
