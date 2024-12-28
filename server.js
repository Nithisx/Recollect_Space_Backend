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



const PORT = process.env.PORT || 5003; 

app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 
