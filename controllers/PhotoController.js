// backend/controllers/PhotoController.js

const path = require('path');
const fs = require('fs');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const { Canvas, Image } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image });
const crypto = require('crypto');

const Folder = require('../models/FolderModel');
const { serverDecrypt } = require('../utils/Encryption');
const { clientDecrypt } = require('../utils/ClientEncryption'); // Import clientDecrypt
require('dotenv').config();

// Load face-api models at startup
const loadModels = async () => {
  try {
    const modelsPath = path.join(__dirname, '..', 'models2'); // Adjust path as needed
    console.log('Loading face-api.js models from:', modelsPath);

    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath),
      faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath),
      faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath),
    ]);

    console.log('Face-api.js models loaded successfully.');
  } catch (error) {
    console.error('Error loading face-api.js models:', error);
    throw error;
  }
};

// Utility: Get face descriptor for a single face in the image
const getFaceDescriptor = async (image, minConfidence = 0.7) => {
  try {
    const detections = await faceapi
      .detectAllFaces(image, new faceapi.SsdMobilenetv1Options({ minConfidence }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!detections.length) {
      throw new Error('No face detected in the image');
    }

    // If more than one face is detected, pick the one with the highest confidence
    if (detections.length > 1) {
      console.warn('Multiple faces detected; using the best match.');
      const bestDetection = detections.reduce((prev, current) =>
        prev.detection.score > current.detection.score ? prev : current
      );
      return bestDetection.descriptor;
    }

    // Return descriptor for the only detected face
    return detections[0].descriptor;
  } catch (error) {
    throw new Error('Error detecting face: ' + error.message);
  }
};

// Utility: Compute similarity using an exponential of the Euclidean distance
const computeSimilarity = (descriptor1, descriptor2) => {
  if (!Array.isArray(descriptor1) || !Array.isArray(descriptor2)) {
    throw new Error('Invalid descriptor format. Descriptors must be arrays.');
  }
  if (descriptor1.length !== descriptor2.length) {
    throw new Error(
      `Descriptor length mismatch: ${descriptor1.length} vs ${descriptor2.length}`
    );
  }

  // Euclidean distance
  const distance = Math.sqrt(
    descriptor1.reduce((sum, value, i) => {
      const diff = value - descriptor2[i];
      return sum + diff * diff;
    }, 0)
  );

  // Convert distance to a similarity score in [0, 1]
  return Math.exp(-distance);
};

// Utility (debug): Prints buffer info to console
const debugBuffer = (buffer, label = '') => {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    console.log(`${label} Buffer is invalid or null`);
    return;
  }
  console.log(`${label} Buffer Details:`);
  console.log(`- Length: ${buffer.length} bytes`);
  console.log(`- First 20 bytes: ${buffer.slice(0, 20).toString('hex')}`);
  console.log(`- Is Buffer: ${Buffer.isBuffer(buffer)}`);
};

/**
 * Controller: Find Similar Faces
 */
const findSimilarFaces = async (req, res) => {
  console.log('\n=== Starting findSimilarFaces function ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // 1. Check for required inputs
    if (!req.headers.authorization) {
      return res
        .status(401)
        .json({ message: 'Authorization token is required.' });
    }
    if (!req.file || !req.body.folderId || !req.body.descriptor) {
      return res.status(400).json({
        message: 'Missing required fields: file, folderId, or descriptor.',
      });
    }

    // 2. Log Master Key (Temporary - REMOVE AFTER VERIFYING)
    console.log('Encryption Master Key:', process.env.ENCRYPTION_MASTER_KEY);

    // 3. Parse incoming descriptor
    let inputDescriptor;
    try {
      inputDescriptor = JSON.parse(req.body.descriptor);
    } catch (err) {
      return res.status(400).json({
        message: 'Invalid descriptor format; must be valid JSON array.',
        error: err.message,
      });
    }

    // 4. Fetch folder from DB
    const folder = await Folder.findById(req.body.folderId);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found.' });
    }

    console.log('Folder found. Photo count:', folder.photos.length);

    // 5. Process each photo in the folder
    const processedPhotos = await Promise.all(
      folder.photos.map(async (photo, index) => {
        console.log(`\nProcessing Photo #${index + 1}: ${photo.name}`);
        console.log('Photo metadata:', {
          id: photo._id,
          name: photo.name,
          contentType: photo.contentType,
          isEncrypted: photo.isEncrypted,
          hasData: !!photo.data,
        });

        // If no data
        if (!photo.data) {
          console.error('No data found for photo:', photo.name);
          return null;
        }

        let decryptedBuffer = null;

        // 5a. Decrypt server-side encryption
        if (photo.isEncrypted) {
          console.log('Photo is encrypted. Attempting to decrypt server-side encryption...');
          // Debug first bytes
          console.log(
            `Encrypted data first 32 bytes: ${photo.data.slice(0, 32).toString(
              'hex'
            )}`
          );
          try {
            decryptedBuffer = await serverDecrypt(
              photo.data,
              process.env.ENCRYPTION_MASTER_KEY
            );
            console.log('Server-side decryption successful for:', photo.name);
          } catch (decryptErr) {
            console.error('Server-side decryption failed:', decryptErr.message);
            return null;
          }
        } else {
          console.log('Photo is not encrypted. Using original data.');
          decryptedBuffer = photo.data;
        }

        // Debug the (decrypted) buffer
        debugBuffer(decryptedBuffer, `After Server Decryption ${photo.name}`);

        // 5b. Decrypt client-side encryption
        console.log('Attempting to decrypt client-side encryption...');
        try {
          // Decrypt client-side encryption
          decryptedBuffer = clientDecrypt(decryptedBuffer);
          console.log('Client-side decryption successful for:', photo.name);
        } catch (clientDecryptErr) {
          console.error('Client-side decryption failed:', clientDecryptErr.message);
          return null;
        }

        // Debug the final decrypted buffer
        debugBuffer(decryptedBuffer, `Final Decrypted ${photo.name}`);

        // 5c. Determine file type
        let fileType;
        try {
          const { fileTypeFromBuffer } = await import('file-type');
          fileType = await fileTypeFromBuffer(decryptedBuffer);
          if (!fileType || !fileType.mime.startsWith('image/')) {
            // Additional manual JPEG check if needed
            const isJpeg =
              decryptedBuffer[0] === 0xff && decryptedBuffer[1] === 0xd8;
            if (!isJpeg) {
              throw new Error('Unable to detect file type and not a valid JPEG');
            }
            // If manual check is OK, we assume it's JPEG
            fileType = { ext: 'jpg', mime: 'image/jpeg' };
          }
        } catch (fileTypeError) {
          console.error('File type validation error:', fileTypeError.message);
          return null; // Skip this photo
        }

        // 5d. Load image with canvas
        let faceDescriptor;
        try {
          const img = await canvas.loadImage(decryptedBuffer);
          faceDescriptor = await getFaceDescriptor(img);
        } catch (err) {
          console.error(`Failed to process image ${photo.name}:`, err.message);
          return null;
        }

        return {
          _id: photo._id,
          name: photo.name,
          contentType: photo.contentType,
          uploadedAt: photo.uploadedAt,
          faceDescriptor: Array.from(faceDescriptor),
          // Return base64 so the frontend can display if needed
          data: `data:${fileType.mime};base64,${decryptedBuffer.toString(
            'base64'
          )}`,
        };
      })
    );

    // Filter out null or failed entries
    const validPhotos = processedPhotos.filter(Boolean);

    if (validPhotos.length === 0) {
      return res.status(404).json({
        message: 'No valid photos found for similarity matching.',
        debug: {
          totalPhotos: folder.photos.length,
          failedProcessing: folder.photos.length,
        },
      });
    }

    // 6. Compute similarities
    const similarities = validPhotos.map((photo) => {
      const similarity = computeSimilarity(inputDescriptor, photo.faceDescriptor);
      return {
        ...photo,
        similarity: similarity * 100, // 0-100 scale
        confidence: similarity, // raw 0-1
      };
    });

    // 7. Determine Adaptive Threshold
    const confidences = similarities.map((p) => p.confidence);
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const stdDev = Math.sqrt(
      confidences.reduce((sum, c) => sum + (c - mean) ** 2, 0) / confidences.length
    );
    const adaptiveThreshold = Math.max(0.6, mean - 2 * stdDev);

    console.log(`Adaptive Threshold: ${adaptiveThreshold.toFixed(4)}`);
    console.log(`Mean Similarity: ${mean.toFixed(4)}`);
    console.log(`Standard Deviation: ${stdDev.toFixed(4)}`);

    // 8. Filter & Sort
    const similarPhotos = similarities
      .filter((p) => p.confidence > adaptiveThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 9); // top 9 if needed

    console.log(`Matches Found: ${similarPhotos.length}`);

    // 9. Return results
    return res.status(200).json({
      similarPhotos,
      debug: {
        totalPhotos: folder.photos.length,
        processedPhotos: validPhotos.length,
        matchesFound: similarPhotos.length,
        threshold: adaptiveThreshold,
      },
    });
  } catch (error) {
    console.error('Critical error in findSimilarFaces:', error);
    return res.status(500).json({
      message: 'Error processing image.',
      error: error.message,
    });
  }
};

module.exports = {
  loadModels,
  findSimilarFaces,
};
