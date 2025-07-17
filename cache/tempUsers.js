const { unregisteredUsers, registeredUsers } = require('../constants/cronJobTimers');

class Cache {
    constructor(time) {
        this.map = new Map();
        this.timeout = time;
    }

    set(key, value) {
        this.map.set(key, {...value, timestamp: Date.now()});
    }

    has(key) {
        return this.map.has(key);
    }

    get(key) {
        return this.map.get(key);
    }

    delete(key) {
        this.map.delete(key);
    }

    clearTimeout() {
        this.map.forEach((value, key) => {
            if (Date.now() - value.timestamp > this.timeout) {
                this.map.delete(key);
            }
        })
    }

    checkMail(email) {
        for (const [key, value] of this.map.entries()) {
            if (value.email === email && Date.now() - value.timestamp < this.timeout) {
                return true;
            }
        }
        return false;
    }
}

const tempUsers = new Cache(unregisteredUsers);
const permanentUsers = new Cache(registeredUsers);
module.exports = {tempUsers, permanentUsers};
