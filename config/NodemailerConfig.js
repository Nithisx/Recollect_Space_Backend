const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

// Load environment variables from the .env file
require('dotenv').config();

// Log the values to check if the .env file is loaded correctly
console.log("Email User: ", process.env.EMAIL_USER);
console.log("Email Pass: ", process.env.EMAIL_PASS);

// Create the transporter using Gmail and environment variables for credentials
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  debug: true,  // Enables debugging output
});

module.exports = transporter;
