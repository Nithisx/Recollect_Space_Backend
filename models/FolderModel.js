const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PhotoSchema = new Schema({
  name: { type: String, required: true },
  data: { type: Buffer, required: true }, // Ensure this is Buffer
  contentType: { 
    type: String, 
    required: true,  // Still required but without a predefined enum
    // Removed the enum to allow any content type
  },
  uploadedAt: { type: Date, default: Date.now },
  isEncrypted: { type: Boolean, default: false },
});

const FolderSchema = new Schema(
  {
    name: { type: String, required: true },
    section: { 
      type: String, 
      enum: ['memory', 'documents', 'other'], 
      required: true 
    },
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    photos: [PhotoSchema],
    sharedWith: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        permission: {
          type: String,
          enum: ['view', 'edit'],
          default: 'view',
        },
      },
    ],
  },
  { timestamps: true } // Enable createdAt / updatedAt
);

module.exports = mongoose.model('Folder', FolderSchema);
