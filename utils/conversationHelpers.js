function getUserOrder(userId1, userId2) {
  const users = [userId1.toString(), userId2.toString()].sort();
  return {
    users,
    isUser1First: users[0] === userId1.toString(),
    usersString: users.join('_'),
  };
}

function getFromBoolean(senderId, users) {
  // false = users[0] -> users[1]
  // true  = users[1] -> users[0]
  return users[1].toString() === senderId.toString();
}

function getActualSender(fromBoolean, users) {
  return fromBoolean ? users[1] : users[0];
}

function getActualReceiver(fromBoolean, users) {
  return fromBoolean ? users[0] : users[1];
}

module.exports = {
  getUserOrder,
  getFromBoolean,
  getActualSender,
  getActualReceiver
};
