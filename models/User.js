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
    subjectName: String,
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
  active: { type: Boolean, default: true },
  pleopleIRated: [
    {
      type:{
        type: String,
        enum: ['personality', 'subject'], // enforce enum constraint
        required: true
      },
      rating: Number,
      to: mongoose.Schema.Types.ObjectId
    }
  ]
});

module.exports = mongoose.model('User', userSchema);
