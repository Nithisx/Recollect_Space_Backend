const sharp = require('sharp');
const axios = require('axios');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const mongoose = require('mongoose');
const Folder = require('../models/FolderModel'); // Adjust path as needed
const { Canvas, Image } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image });
const path = require('path'); // Import path module


// Initialize face-api models
const loadModels = async () => {
  try {
    const modelsPath = path.join(__dirname, '..', 'models2');
    console.log('Loading models from:', modelsPath);
    
    // Load models with corrected paths
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath),
      faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath),
      faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath)
    ]);

    // Verify models are loaded
    console.log('Verifying model loading status:');
    console.log('- SSD Mobilenet V1:', faceapi.nets.ssdMobilenetv1.isLoaded);
    console.log('- Face Landmark 68:', faceapi.nets.faceLandmark68Net.isLoaded);
    console.log('- Face Recognition:', faceapi.nets.faceRecognitionNet.isLoaded);

    if (!faceapi.nets.ssdMobilenetv1.isLoaded || 
        !faceapi.nets.faceLandmark68Net.isLoaded || 
        !faceapi.nets.faceRecognitionNet.isLoaded) {
      throw new Error('One or more models failed to load');
    }

  } catch (error) {
    console.error('Error loading models:', error);
    throw error;
  }
};

const findSimilarFaces = async (req, res) => {
  console.log('=== Starting findSimilarFaces function ===');
  console.log('Checking if models are loaded:');
  console.log('- SSD Mobilenet V1:', faceapi.nets.ssdMobilenetv1.isLoaded);
  console.log('- Face Landmark 68:', faceapi.nets.faceLandmark68Net.isLoaded);
  console.log('- Face Recognition:', faceapi.nets.faceRecognitionNet.isLoaded);
  try {
    // Get authorization token from request headers
    const authToken = req.headers.authorization;
    if (!authToken) {
      return res.status(401).json({ 
        message: 'Authorization token is required'
      });
    }

    // Validate inputs
    if (!req.file || !req.body.folderId || !req.body.descriptor) {
      return res.status(400).json({ 
        message: 'Missing required fields: file, folderId, or descriptor'
      });
    }

    // Parse the input descriptor
    const inputDescriptor = JSON.parse(req.body.descriptor);

    // Fetch folder directly from MongoDB
    const folder = await Folder.findById(req.body.folderId);
    if (!folder) {
      return res.status(404).json({ 
        message: 'Folder not found'
      });
    }

    console.log(`Processing folder: ${folder._id} with ${folder.photos.length} photos`);
    
    // Process each photo in the folder
    const processedPhotos = await Promise.all(
      folder.photos.map(async (photo) => {
        try {
          if (!photo.data) {
            console.log(`No photo data found for photo named: ${photo.name}`);
            return null;
          }

          const img = await canvas.loadImage(photo.data);
          
          // Use enhanced face detection with higher confidence threshold
          const detection = await getFaceDescriptor(img, 0.7);
          
          if (!detection) {
            console.log(`No face detected in photo: ${photo.name}`);
            return null;
          }

          return {
            _id: photo._id,
            name: photo.name,
            uploadedAt: photo.uploadedAt,
            faceDescriptor: Array.from(detection),
            data: `data:${photo.contentType};base64,${photo.data.toString('base64')}`
          };
        } catch (error) {
          console.error(`Error processing photo ${photo.name}:`, error);
          return null;
        }
      })
    );

    const validPhotos = processedPhotos.filter(photo => photo !== null);
    console.log(`Successfully processed ${validPhotos.length} photos out of ${folder.photos.length}`);

    // Enhanced similarity matching with adaptive threshold
    const similarities = validPhotos.map(photo => {
      const similarity = computeSimilarity(inputDescriptor, photo.faceDescriptor);
      return { 
        ...photo,
        similarity: similarity * 100,
        confidence: similarity // Keep raw similarity for threshold calculation
      };
    });

    // Calculate adaptive threshold based on similarity distribution
    const confidences = similarities.map(p => p.confidence);
    const mean = confidences.reduce((a, b) => a + b) / confidences.length;
    const stdDev = Math.sqrt(
      confidences.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / confidences.length
    );
    
    // Use mean - 2*stdDev as minimum threshold, but not lower than 0.6
    const adaptiveThreshold = Math.max(0.6, mean - 2 * stdDev);

    const similarPhotos = similarities
      .filter(photo => photo.confidence > adaptiveThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 9);

    return res.json({ 
      similarPhotos,
      debug: {
        totalPhotos: folder.photos.length,
        processedPhotos: validPhotos.length,
        matchesFound: similarPhotos.length,
        threshold: adaptiveThreshold,
        meanSimilarity: mean,
        stdDevSimilarity: stdDev
      }
    });

  } catch (error) {
    console.error('Critical error in findSimilarFaces:', error);
    return res.status(500).json({ 
      message: 'Error processing image',
      error: error.message
    });
  }
};

// Keep the existing computeSimilarity function
const computeSimilarity = (descriptor1, descriptor2) => {
  try {
    if (!Array.isArray(descriptor1) || !Array.isArray(descriptor2)) {
      throw new Error('Invalid descriptor format - must be arrays');
    }
    
    if (descriptor1.length !== descriptor2.length) {
      throw new Error(`Descriptor length mismatch: ${descriptor1.length} vs ${descriptor2.length}`);
    }

    // Calculate Euclidean distance (L2 distance)
    const distance = Math.sqrt(
      descriptor1.reduce((sum, value, i) => {
        const diff = value - descriptor2[i];
        return sum + diff * diff;
      }, 0)
    );

    // Convert distance to similarity score (0-1 range)
    // Using exponential decay function for better differentiation
    const similarity = Math.exp(-distance);
    
    return similarity;
  } catch (error) {
    console.error('Error in computeSimilarity:', error);
    throw error;
  }
};

// Enhanced face detection with additional parameters
const getFaceDescriptor = async (image, minConfidence = 0.7) => {
  try {
    // Detect all faces first to handle multiple faces
    const detections = await faceapi
      .detectAllFaces(image, new faceapi.SsdMobilenetv1Options({ minConfidence }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (!detections.length) {
      throw new Error('No face detected in the image');
    }

    if (detections.length > 1) {
      // If multiple faces, return the one with highest confidence
      return detections.reduce((prev, current) => {
        return (prev.detection.score > current.detection.score) ? prev : current;
      }).descriptor;
    }

    return detections[0].descriptor;
  } catch (error) {
    throw new Error('Error detecting face: ' + error.message);
  }
};

module.exports = { 
  findSimilarFaces,
  loadModels
};