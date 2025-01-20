// backend/controllers/PhotoController.js

const path = require('path');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const { Canvas, Image } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image });

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

// Utility: Get all face descriptors in the image
const getFaceDescriptors = async (image, minConfidence = 0.7) => {
  try {
    const detections = await faceapi
      .detectAllFaces(image, new faceapi.SsdMobilenetv1Options({ minConfidence }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!detections.length) {
      throw new Error('No faces detected in the image');
    }

    // Return all descriptors
    return detections.map(detection => detection.descriptor);
  } catch (error) {
    throw new Error('Error detecting faces: ' + error.message);
  }
};

// Utility: Compute cosine similarity
const computeCosineSimilarity = (descriptor1, descriptor2) => {
  // Enhanced Logging
  console.log('Computing Cosine Similarity between descriptors:');
  console.log('Descriptor 1:', descriptor1);
  console.log('Descriptor 2:', descriptor2);

  // Check if descriptors are arrays
  if (!Array.isArray(descriptor1) || !Array.isArray(descriptor2)) {
    throw new Error('Invalid descriptor format. Descriptors must be arrays.');
  }

  // Check if descriptors have the same length
  if (descriptor1.length !== descriptor2.length) {
    throw new Error(
      `Descriptor length mismatch: ${descriptor1.length} vs ${descriptor2.length}`
    );
  }

  // Compute dot product
  const dotProduct = descriptor1.reduce((sum, value, i) => sum + value * descriptor2[i], 0);

  // Compute magnitudes
  const magnitude1 = Math.sqrt(descriptor1.reduce((sum, value) => sum + value * value, 0));
  const magnitude2 = Math.sqrt(descriptor2.reduce((sum, value) => sum + value * value, 0));

  if (magnitude1 === 0 || magnitude2 === 0) {
    console.warn('One of the descriptors has zero magnitude.');
    return 0;
  }

  // Return cosine similarity
  return dotProduct / (magnitude1 * magnitude2); // Value between -1 and 1
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
 * Helper Function: Handle Decryption of Uploaded Image
 * This function decrypts the uploaded image using server-side and client-side decryption.
 */
const handleDecryption = async (file, label) => {
  let decryptedBuffer = null;

  // 1. Decrypt server-side encryption if applicable
  if (file.isEncrypted) {
    console.log('Image is encrypted. Attempting to decrypt server-side encryption...');
    try {
      decryptedBuffer = await serverDecrypt(
        file.buffer,
        process.env.ENCRYPTION_MASTER_KEY
      );
      console.log('Server-side decryption successful for:', file.originalname);
    } catch (decryptErr) {
      throw new Error(`Server-side decryption failed: ${decryptErr.message}`);
    }
  } else {
    console.log('Image is not encrypted. Using original data.');
    decryptedBuffer = file.buffer;
  }

  // Debug the (decrypted) buffer
  debugBuffer(decryptedBuffer, `After Server Decryption ${label}`);

  // 2. Decrypt client-side encryption
  console.log('Attempting to decrypt client-side encryption...');
  try {
    decryptedBuffer = clientDecrypt(decryptedBuffer);
    console.log('Client-side decryption successful for:', file.originalname);
  } catch (clientDecryptErr) {
    throw new Error(`Client-side decryption failed: ${clientDecryptErr.message}`);
  }

  // Debug the final decrypted buffer
  debugBuffer(decryptedBuffer, `Final Decrypted ${label}`);

  return decryptedBuffer;
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
    if (!req.file || !req.body.folderId) {
      return res.status(400).json({
        message: 'Missing required fields: file or folderId.',
      });
    }

    // 2. Log Master Key (Temporary - REMOVE AFTER VERIFYING)
    console.log('Encryption Master Key:', process.env.ENCRYPTION_MASTER_KEY);

    // 3. Extract input face descriptor from the uploaded image
    let inputDescriptor;
    let normalizedInputDescriptor; // Declare here to ensure it's accessible in the loop
    try {
      const decryptedInputBuffer = await handleDecryption(req.file, 'input');
      debugBuffer(decryptedInputBuffer, 'Decrypted Input Image');

      const img = await canvas.loadImage(decryptedInputBuffer);
      const descriptors = await getFaceDescriptors(img);

      if (descriptors.length === 0) {
        return res.status(400).json({ message: 'No faces detected in the input image.' });
      }

      if (descriptors.length > 1) {
        console.warn('Multiple faces detected in the input image. Using the first detected face.');
        // Optionally, inform the user about multiple faces
      }

      inputDescriptor = descriptors[0];
      console.log('Input face descriptor extracted successfully.');

      // Normalize input descriptor and convert to regular array
      const magnitude = Math.sqrt(inputDescriptor.reduce((sum, val) => sum + val * val, 0));
      if (magnitude === 0) {
        throw new Error('Input descriptor has zero magnitude.');
      }
      normalizedInputDescriptor = Array.from(inputDescriptor.map((value) => value / magnitude));
      console.log('Input descriptor normalized successfully.');
      console.log('Normalized Input Descriptor:', normalizedInputDescriptor);
    } catch (err) {
      console.error('Error processing input image:', err.message);
      return res.status(400).json({
        message: 'Error processing input image.',
        error: err.message,
      });
    }

    // 4. Fetch folder from DB
    const folder = await Folder.findById(req.body.folderId);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found.' });
    }

    console.log('Folder found. Photo count:', folder.photos.length);

    if (!folder.photos || folder.photos.length === 0) {
      return res.status(404).json({ message: 'No photos found in the folder.' });
    }

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

        // 5d. Load image with canvas and extract face descriptors
        let faceDescriptors;
        try {
          const img = await canvas.loadImage(decryptedBuffer);
          faceDescriptors = await getFaceDescriptors(img);
          console.log(`Detected ${faceDescriptors.length} face(s) in ${photo.name}`);
        } catch (err) {
          console.error(`Failed to process image ${photo.name}:`, err.message);
          return null;
        }

        if (!Array.isArray(faceDescriptors) || faceDescriptors.length === 0) {
          console.error(`No valid face descriptors extracted from ${photo.name}.`);
          return null;
        }

        // Normalize all face descriptors and convert to regular arrays
        const normalizedFaceDescriptors = faceDescriptors.map((descriptor, descIndex) => {
          const magnitude = Math.sqrt(descriptor.reduce((sum, val) => sum + val * val, 0));
          if (magnitude === 0) {
            console.warn(`Descriptor #${descIndex + 1} in ${photo.name} has zero magnitude.`);
            return Array.from(descriptor); // Return as is; similarity will be zero
          }
          return Array.from(descriptor.map((value) => value / magnitude));
        });

        return {
          _id: photo._id,
          name: photo.name,
          contentType: photo.contentType,
          uploadedAt: photo.uploadedAt,
          faceDescriptors: normalizedFaceDescriptors,
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
    const matches = [];

    for (const photo of validPhotos) {
      for (const descriptor of photo.faceDescriptors) {
        try {
          console.log(`\nComparing input face with a face in photo: ${photo.name}`);
          console.log('Input Descriptor Length:', normalizedInputDescriptor.length);
          console.log('Group Descriptor Length:', descriptor.length);
          console.log(`\nComparing input face with a face in photo: ${photo.name}`);
      
          // Log the input and comparison face descriptors and the similarity score
          console.log(`Input face descriptor: ${JSON.stringify(normalizedInputDescriptor)}`);
          console.log(`Comparison face descriptor: ${JSON.stringify(descriptor)}`);
          // Ensure descriptors are arrays
          if (!Array.isArray(normalizedInputDescriptor)) {
            console.error('Input Descriptor is not an array.');
            continue; // Skip this comparison
          }
          if (!Array.isArray(descriptor)) {
            console.error(`Descriptor in photo ${photo.name} is not an array.`);
            continue; // Skip this comparison
          }

          // Compute similarity
          const similarity = computeCosineSimilarity(normalizedInputDescriptor, descriptor);
          console.log(`Similarity Score: ${similarity.toFixed(4)}`);

          if (similarity > 0.9) { // Threshold set to 0.5, adjust as needed
            matches.push({
              _id: photo._id,
              name: photo.name,
              contentType: photo.contentType,
              uploadedAt: photo.uploadedAt,
              similarity: (similarity * 100).toFixed(2), // 0-100 scale
              data: photo.data,
            });
            console.log(`Match found in photo: ${photo.name}`);
            break; // Stop checking other faces in this photo
          }
        } catch (similarityError) {
          console.error(`Error computing similarity for ${photo.name}:`, similarityError.message);
          continue; // Skip to next descriptor
        }
      }
    }

    console.log(`Total Matches Found: ${matches.length}`);

    // 7. Return results
    return res.status(200).json({
      similarPhotos: matches,
      debug: {
        totalPhotos: folder.photos.length,
        processedPhotos: validPhotos.length,
        matchesFound: matches.length,
        threshold: 0.5, // Fixed threshold
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
