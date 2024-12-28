// models/folderModel.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const folderSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    section: {
      type: String,
      enum: ['memory', 'documents', 'other'],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    photos: [
      {
        name: { type: String, required: true },
        data: Buffer,
        contentType: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
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

module.exports = mongoose.model('Folder', folderSchema);
