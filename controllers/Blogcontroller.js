// controllers/blogController.js
const Blog = require('../models/Blog');
const { serverEncrypt, serverDecrypt } = require('../utils/Encryption');
require('dotenv').config();

/**
 * Create a new blog post in a specific folder
 * Expects encrypted title and content from the client (Base64-encoded strings)
 */
const createBlog = async (req, res) => {
    const { folderId } = req.params;
    const { title, content } = req.body;

    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required.' });
    }

    try {
        // Decode Base64-encoded encrypted title and content
        const clientEncryptedTitleBuffer = Buffer.from(title, 'base64');
        const clientEncryptedContentBuffer = Buffer.from(content, 'base64');

        // Perform server-side encryption (double encryption)
        const serverEncryptedTitle = serverEncrypt(clientEncryptedTitleBuffer, process.env.ENCRYPTION_MASTER_KEY);
        const serverEncryptedContent = serverEncrypt(clientEncryptedContentBuffer, process.env.ENCRYPTION_MASTER_KEY);

        // Create and save the blog entry
        const blog = new Blog({
            title: serverEncryptedTitle, // Store as Buffer
            content: serverEncryptedContent, // Store as Buffer
            folderId,
        });

        await blog.save();

        return res.status(201).json({ message: 'Blog saved successfully!', blog });
    } catch (error) {
        console.error('Error creating blog:', error);
        return res.status(500).json({ error: 'Failed to save blog.' });
    }
};

/**
 * Fetch all blogs in a specific folder
 * Returns client-side encrypted Base64-encoded strings
 */
const getBlogsByFolder = async (req, res) => {
    const { folderId } = req.params;

    try {
        const blogs = await Blog.find({ folderId }).sort({ createdAt: -1 });

        // Decrypt server-side encryption to get client-encrypted data
        const decryptedBlogs = blogs.map(blog => {
            const decryptedTitleBuffer = serverDecrypt(blog.title, process.env.ENCRYPTION_MASTER_KEY);
            const decryptedContentBuffer = serverDecrypt(blog.content, process.env.ENCRYPTION_MASTER_KEY);

            return {
                _id: blog._id,
                folderId: blog.folderId,
                title: decryptedTitleBuffer.toString('base64'), // Client-encrypted Base64 string
                content: decryptedContentBuffer.toString('base64'), // Client-encrypted Base64 string
                createdAt: blog.createdAt,
                updatedAt: blog.updatedAt,
            };
        });

        res.status(200).json(decryptedBlogs);
    } catch (error) {
        console.error('Error fetching blogs:', error);
        res.status(500).json({ error: 'Failed to fetch blogs.' });
    }
};

module.exports = {
    createBlog,
    getBlogsByFolder,
};
