const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    folderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Folder',  // assuming you have a Folder model
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Blog', blogSchema);
