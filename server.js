const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db'); 
const authRoutes = require('./routes/authRoutes'); 
const folderRoutes = require('./routes/folderRoutes');
const path = require('path');
const blogRoutes =require("./routes/Blogroutes")

dotenv.config();
connectDB(); 

const app = express();

app.use(cors());
app.use(express.json()); 
app.use('/api/auth', authRoutes); 
app.use('/api/folders', folderRoutes); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', blogRoutes);



app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    console.log(`Server is running on port ${process.env.PORT || 3000}`);
  });
  
