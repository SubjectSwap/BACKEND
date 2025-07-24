class ConversationUsersOverloaded extends Error {
  constructor(message = 'Conversation must have exactly 2 users') {
    super(message);
    this.name = 'ConversationUsersOverloaded';
    this.statusCode = 400;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {ConversationUsersOverloaded};