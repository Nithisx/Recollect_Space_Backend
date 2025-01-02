// controllers/blogController.js
const Blog = require('../models/Blog');

// Create a new blog post in a specific folder
const createBlog = async (req, res) => {  // Ensure this is declared using 'const' or 'function'
    const { folderId } = req.params;
    const { title, content } = req.body;

    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required.' });
    }

    try {
        const blog = new Blog({
            title,
            content,
            folderId,
        });

        await blog.save();

        return res.status(201).json({ message: 'Blog block saved successfully!', blog });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to save blog block.' });
    }
};

// Fetch all blogs in a specific folder
const getBlogsByFolder = async (req, res) => {
    const { folderId } = req.params;

    try {
        const blogs = await Blog.find({ folderId }).sort({ createdAt: -1 });
        res.status(200).json(blogs);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch blogs.' });
    }
};

module.exports = {
    createBlog,  // Ensure this is declared properly
    getBlogsByFolder,
};
