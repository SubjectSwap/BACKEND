/**
 * Depriciated concept now  
 * Initial plan was to xor _id's as private keys  
 * using a secret key and reobtain  
 * them by xor-ing again.
 */

function xorId(id) {
    // Convert ObjectId to hex string, then to int, then xor
    return parseInt(id.toString().slice(-8), 16) ^ process.env.BIG_PRIME;
}

module.exports = {
    xorId
}