// Replace import statement with require
const mongoose = require('mongoose');

// Define your photo schema
const photoSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    required: true
  },
  faceDescriptor: {
    type: [Number],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Replace export statement with module.exports
const Photo = mongoose.model('Photo', photoSchema);
module.exports = Photo;
