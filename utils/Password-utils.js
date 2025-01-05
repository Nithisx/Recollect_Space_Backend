const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;
const BCRYPT_VERSION = '$2a$'; // Force older version for compatibility

const passwordUtils = {
    hashPassword: async (password) => {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        const modifiedSalt = BCRYPT_VERSION + salt.substring(4);
        return bcrypt.hash(password, modifiedSalt);
    },

    verifyPassword: async (password, hash) => {
        try {
            return await bcrypt.compare(password, hash);
        } catch (error) {
            console.error('Password verification error:', error);
            return false;
        }
    }
};

module.exports = passwordUtils;
