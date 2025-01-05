const express = require('express');
const { findSimilarFaces } = require('../controllers/PhotoController.js');
const multer = require('multer');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.post('/find-similar', upload.single('image'), findSimilarFaces);

module.exports = router;
