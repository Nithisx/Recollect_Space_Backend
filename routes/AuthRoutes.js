// routes/authRoutes.js
const express = require('express');
const { loginUser, sendOTP, verifyOTP, forgotPassword, resetPassword } = require('../controllers/AuthControllers');

const router = express.Router();

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
