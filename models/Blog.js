const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    title: {
        type: Buffer, // Encrypted data
        required: true,
    },
    content: {
        type: Buffer, // Encrypted data
        required: true,
    },
    folderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Folder', // Ensure you have a Folder model
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Blog', blogSchema);
