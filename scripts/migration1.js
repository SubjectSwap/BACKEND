const User = require('../models/User');
const updateUser = async (userId) => {
  try {
    const updateData = {
      languages: ["French", "English"],
      teachingSubjects: [
        // Biochem User 1
        // Biochem User 2
        // Civics User 3
        {
          subjectVector: [
    0,
    0,
    0,
    0,
    0.4982728791224398,
    0.8304547985373997,
    0.2491364395612199,
    0
  ],
          selfRating: 9,
          noOfRatings: 25,
          totalReceivedRatings: 2500,
          active: true
        },
        {
            // Chem User 1
            // Maths User 2
            // Chem User 3
          subjectVector: [
    0, 1, 0, 0,
    0, 0, 0, 0
  ],
          selfRating: 8,
          noOfRatings: 180,
          totalReceivedRatings: 1500,
          active: true
        },
        {
            // Macroeconomics User 1
            // None User 2
            // Biology User 3
          subjectVector: [
    0.22808577638091165,
    0.6082287370157645,
    0,
    0,
    0.7602859212697056,
    0,
    0,
    0
  ],
          selfRating: 10,
          noOfRatings: 140,
          totalReceivedRatings: 145,
          active: true
        }
      ],
      learningSubjects: ["Physics", "SST"],
      personalityRating: {
        average: 1800,
        totalRatings: 190
      }
    };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      throw new Error('User not found');
    }
    console.log(updatedUser);
    return updatedUser;
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
};

module.exports = {
  updateUser
};