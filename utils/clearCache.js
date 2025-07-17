function clearUserCache() {
    const {tempUsers} = require('../cache/tempUsers');
    tempUsers.clearTimeout();
}

module.exports = {clearUserCache};