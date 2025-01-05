// controllers/folderController.js
const Folder = require('../models/FolderModel');
const User = require('../models/User');
const { formatISO } = require('date-fns');
const mongoose = require('mongoose');

// Create new folder
const createFolder = async (req, res) => {
  try {
    const { name, section, userId } = req.body;

    // Optional: check for existing folder with same name & user
    const existingFolder = await Folder.findOne({ name, userId });
    if (existingFolder) {
      return res.status(400).json({ message: 'Folder already exists' });
    }

    const newFolder = new Folder({ name, section, userId });
    await newFolder.save();

    res.status(201).json({
      message: 'Folder created successfully',
      folder: newFolder,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error });
  }
};

// Get all folders owned by user
const getFoldersByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    const folders = await Folder.find({ userId });
    res.status(200).json({ folders });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error });
  }
};

// Upload photos
const uploadPhoto = async (req, res) => {
  const { folderId } = req.params;
  try {
    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    req.files.forEach((file) => {
      folder.photos.push({
        name: file.originalname,
        data: file.buffer,
        contentType: file.mimetype,
        uploadedAt: formatISO(new Date()),
      });
    });

    await folder.save();
    res.status(200).json({ folder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error uploading photos', error });
  }
};

// Get folder by ID
const  getFolderById = async (req, res) => {
  try {
    const { folderId } = req.params;
    console.log('Received folderId:', folderId);

    if (!mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({ message: 'Invalid folderId format' });
  }
    const folder = await Folder.findById(folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    // Convert photo Buffers to base64 for the front-end
    const photos = folder.photos.map((photo) => ({
      _id: photo._id,
      name: photo.name,
      updatedAt: photo.uploadedAt,
      data: photo.data.toString('base64'),
      contentType: photo.contentType,
    }));

    res.status(200).json({ folder: { ...folder._doc, photos } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error });
  }
};

// Delete folder
const deleteFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const deletedFolder = await Folder.findByIdAndDelete(folderId);

    if (!deletedFolder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    res.status(200).json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: 'Error deleting folder', error: error.message });
  }
};

// (Optional) Check folder access permission
const checkFolderAccess = async (req, res, next) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const isOwner = folder.userId.toString() === req.user.id;
    const sharedAccess = folder.sharedWith.find(
      (share) => share.user.toString() === req.user.id
    );

    // If not the owner and not in sharedWith, no access
    if (!isOwner && !sharedAccess) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // If shared with "view" permission only, do not allow write ops
    if (
      !isOwner &&
      sharedAccess.permission !== 'edit' &&
      ['PUT', 'DELETE', 'POST'].includes(req.method)
    ) {
      return res.status(403).json({ message: 'Read-only access' });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createFolder,
  getFoldersByUserId,
  uploadPhoto,
  getFolderById,
  deleteFolder,
  checkFolderAccess,
};
