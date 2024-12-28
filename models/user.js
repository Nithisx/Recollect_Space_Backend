const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    otp: String,
    otpExpiry: Date,
    verified: { type: Boolean, default: false },
    resetToken: String,
    resetTokenExpiry: Date
});

// Only hash if password is modified and not already hashed
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || this.password.startsWith('$2')) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

userSchema.methods = {
    matchPassword: async function(enteredPassword) {
        try {
            return await bcrypt.compare(enteredPassword, this.password);
        } catch (error) {
            return false;
        }
    },

    setOTP: function() {
        this.otp = Math.floor(100000 + Math.random() * 900000).toString();
        this.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        return this.otp;
    },

    verifyOTP: function(enteredOtp) {
        if (this.otp === enteredOtp && this.otpExpiry > new Date()) {
            this.otp = undefined;
            this.otpExpiry = undefined;
            this.verified = true;
            return true;
        }
        return false;
    }
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;