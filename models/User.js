const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    index: true
  },
  email: { type: String, unique: true },
  passwordHash: String,
  profilePicUrl: { type: String, default: null },
  description: String,
  languages: [String],
  teachingSubjects: [{
    subjectVector: [Number],
    subjectName: String,
    selfRating: Number,
    noOfRatings: Number, // Total no of ratings
    totalReceivedRatings: Number, // Sum of all ratings
    active: { type: Boolean, default: true }
  }],
  learningSubjects: [String],
  personalityRating: {
    average: Number, // Not really an average, just the sum of all ratings
    totalRatings: Number // Total no of ratings
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
