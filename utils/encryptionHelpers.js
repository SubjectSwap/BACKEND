function xorId(id) {
    // Convert ObjectId to hex string, then to int, then xor
    return parseInt(id.toString().slice(-8), 16) ^ process.env.BIG_PRIME;
}

module.exports = {
    xorId
}