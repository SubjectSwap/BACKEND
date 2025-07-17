const containerObj = {
    unregisteredUsers: 5 * 60 * 1000, // 5 minutes
    registeredUsers: 30 * 24 * 60 * 60 * 1000 // 30 days
}

module.exports = {
    ...containerObj,
    minTime: Math.min(...Object.values(containerObj))
}