// routes/blogRoutes.js
const express = require('express');
const router = express.Router();
const { createBlog, getBlogsByFolder } = require('../controllers/blogController');
const { protect } = require('../middleware/authMiddleware');  // Assuming you have token verification middleware

// Route to create a new blog post in a specific folder
router.post('/folders/:folderId/blog', protect, createBlog);
// Route to get all blogs for a specific folder
router.get('/folders/:folderId/blogs', protect, getBlogsByFolder);


module.exports = router;
