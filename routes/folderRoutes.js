// routes/folderRoutes.js
const express = require('express');
const router = express.Router();
const Folder = require('../models/folderModel');
const User = require('../models/user');
const folderController = require('../controllers/folderController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');
const mongoose = require('mongoose');

// Multer config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  },
});

// ----------------------------
// SHARE FOLDER ENDPOINT
// ----------------------------
router.post('/:folderId/share', protect, async (req, res) => {
  const { folderId } = req.params;
  const { email, permission } = req.body;

  try {
    // Find the user by email
    const userToShareWith = await User.findOne({ email });
    if (!userToShareWith) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the folder
    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    // Check if folder is already shared with this user
    const alreadyShared = folder.sharedWith.some(
      (shared) => shared.user.toString() === userToShareWith._id.toString()
    );
    if (alreadyShared) {
      return res
        .status(400)
        .json({ message: 'Folder is already shared with this user' });
    }

    // Push into sharedWith array
    folder.sharedWith.push({
      user: userToShareWith._id,
      permission: permission || 'view',
    });

    await folder.save();

    return res.json({
      folderId: folder._id,
      sharedWith: userToShareWith.email, // Return email for front-end convenience
      permission: permission || 'view',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------
// GET FOLDERS SHARED WITH ME
// ----------------------------
router.get('/shared', protect, async (req, res) => {
  try {
    // The currently logged in user's _id is in req.user
    const userId = new mongoose.Types.ObjectId(req.user._id);

    const sharedFolders = await Folder.find({
      'sharedWith.user': userId,
    })
      .populate('userId', 'name email') // The owner of the folder
      .populate('sharedWith.user', 'name email') // All shared users
      .lean()
      .exec();

    // Optional: attach the owner's email in the response
    const foldersWithOwner = sharedFolders.map((folder) => ({
      ...folder,
      ownerEmail: folder.userId.email,
    }));

    res.json(foldersWithOwner);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ----------------------------
// OTHER FOLDER ROUTES
// ----------------------------
router.post('/create-folder', protect, folderController.createFolder);
router.get('/:folderId', protect, folderController.getFolderById);
router.get('/user/:userId', protect, folderController.getFoldersByUserId);
router.post(
  '/:folderId/upload',
  protect,
  upload.array('photos', 10),
  folderController.uploadPhoto
);
router.delete('/:folderId', protect, folderController.deleteFolder);

module.exports = router;
