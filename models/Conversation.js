const mongoose = require('mongoose');
const { ConversationUsersOverloaded } = require('../errors/chat_related_errors');
const { applyTimestamps } = require('./User');

const conversationSchema = new mongoose.Schema({
  participantId: String, // smallerId_biggerId
  messages: [{
    type: {
      type: String,
      enum: ['text', 'file', 'deleted'], // enforce enum constraint
      required: true
    },
    timestamp: { type: Date, default: Date.now },
    content: String, // The content of the message or url of the file
    from: Boolean, // true if the message is from the biggerId, false if sent by the smallerId
    id: mongoose.Schema.Types.ObjectId,
  }],
  noOfMessages: Number
})

module.exports = mongoose.model('Conversation', conversationSchema);