const crypto = require('crypto');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const transporter = require('../config/NodemailerConfig');
const passwordUtils = require('../utils/Password-utils');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

const sendOTP = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
        let user = await User.findOne({ email });
        if (user && user.verified) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const otp = crypto.randomInt(100000, 999999).toString();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        const hashedPassword = await passwordUtils.hashPassword(password);

        if (!user) {
            user = new User({ 
                email, 
                password: hashedPassword,
                otp, 
                otpExpiry 
            });
        } else {
            user.password = hashedPassword;
            user.otp = otp;
            user.otpExpiry = otpExpiry;
        }

        await user.save();

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your OTP Code',
            text: `Your OTP is ${otp}. It expires in 10 minutes.`,
        });

        res.status(200).json({ message: 'OTP sent to email' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

const verifyOTP = async (req, res) => {
    const { email, otp } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.otp !== otp || user.otpExpiry < Date.now()) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        user.verified = true;
        user.otp = undefined;
        user.otpExpiry = undefined;
        await user.save();

        const token = generateToken(user._id);
        res.status(200).json({ message: 'User verified successfully', token });
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

const loginUser = async (req, res) => {
    console.log('\n=== Login Attempt Debug Log ===');
    const { email, password } = req.body;
    
    // Input validation logs
    console.log('Login attempt details:');
    console.log('- Email:', email);
    console.log('- Password received:', !!password);
    console.log('- Password length:', password?.length);
    console.log('- Password type:', typeof password);
    console.log('- Raw password bytes:', Buffer.from(password).toString('hex'));

    if (!email || !password) {
        console.log('ERROR: Missing credentials');
        return res.status(400).json({ message: 'Email or password missing' });
    }

    try {
        // Database query logs
        console.log('\nDatabase lookup:');
        const user = await User.findOne({ email });
        console.log('- User found:', !!user);
        
        if (!user) {
            console.log('ERROR: No user found with email:', email);
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // User verification check
        console.log('\nUser verification status:');
        console.log('- Is verified:', user.verified);
        
        if (!user.verified) {
            console.log('ERROR: User not verified');
            return res.status(400).json({ message: 'User not verified. Please verify OTP first.' });
        }

        // Password verification logs
        console.log('\nPassword verification:');
        console.log('- Stored hash:', user.password);
        
        // First try with original password
        console.log('\nAttempting password verification:');
        const isValid = await passwordUtils.verifyPassword(password, user.password);
        console.log('- Password match result:', isValid);
        
        // If failed, try with trimmed password
        if (!isValid) {
            console.log('\nAttempting with trimmed password:');
            const trimmedValid = await passwordUtils.verifyPassword(password.trim(), user.password);
            console.log('- Trimmed password match:', trimmedValid);
            
            if (!trimmedValid) {
                // Debug hash generation
                console.log('\nDebug hash generation:');
                const debugHash = await passwordUtils.hashPassword(password);
                console.log('- Generated hash:', debugHash);
                console.log('- Stored hash:  ', user.password);
                console.log('ERROR: Password verification failed');
                return res.status(400).json({ message: 'Invalid credentials' });
            }
        }

        // Success logs
        console.log('\nLogin successful:');
        console.log('- Generating token for user ID:', user._id);
        const token = generateToken(user._id);
        
        res.json({ user, token });
    } catch (error) {
        console.error('\nError in login process:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ message: 'Server error' });
    }
};

const forgotPassword = async (req, res) => {
    const { email } = req.body;
    
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const resetToken = crypto.randomInt(100000, 999999).toString();
        const resetTokenExpiry = new Date(Date.now() + 10 * 60 * 1000);

        user.resetToken = resetToken;
        user.resetTokenExpiry = resetTokenExpiry;
        await user.save();

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Request',
            text: `Your password reset code is ${resetToken}. It expires in 10 minutes.`,
        });

        res.status(200).json({ message: 'Reset code sent to email' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

const resetPassword = async (req, res) => {
    const { email, resetToken, newPassword } = req.body;

    try {
        if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
            return res.status(400).json({
                message: 'New password is required and must be a non-empty string'
            });
        }

        const user = await User.findOne({
            email,
            resetToken,
            resetTokenExpiry: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        user.password = await passwordUtils.hashPassword(newPassword);
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();

        res.status(200).json({ message: 'Password reset successful' });
    } catch (err) {
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

module.exports = { 
    sendOTP, 
    verifyOTP, 
    loginUser, 
    forgotPassword, 
    resetPassword
};