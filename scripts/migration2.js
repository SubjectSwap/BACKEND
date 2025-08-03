const { default: mongoose } = require('mongoose');
const User = require('../models/User');
const updateUser = async (userId, toId) => {
  try {
    const updateData = {
        pleopleIRated: [{
            type: 'personality',
            rating: 8,
            to: new mongoose.Types.ObjectId(toId)
        }]
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