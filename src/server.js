const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const requestRoutes = require('./routes/requests');
const notificationRoutes = require('./routes/notifications');
const otpRoutes = require('./routes/otp');
const emailVerificationRoutes = require('./routes/emailVerification');
const verificationRoutes = require('./routes/verification');
const adminRoutes = require('./routes/admin');
const bloodCampRoutes = require('./routes/bloodCamps');
const { initializeFirebase } = require('./config/firebase');
const { logSystemEvent, logError } = require('./services/loggerService');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CORS configuration - Allow connections from mobile devices
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:19006', // Expo development server
      'exp://localhost:19000', // Expo Go app
      'exp://192.168.1.6:19000', // Your local network
      'http://192.168.1.6:19006', // Your local network
      'http://192.168.1.6:3000', // Your local network
      'exp://192.168.68.101:19000', // Fallback network
      'http://192.168.68.101:19006', // Fallback network
      'http://192.168.68.101:3000' // Fallback network
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow all origins for development
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'LifePulse API is running',
    timestamp: new Date().toISOString(),
    clientIP: req.ip,
    userAgent: req.get('User-Agent')
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'LifePulse API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', userRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/email-verification', emailVerificationRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/blood-camps', bloodCampRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logError(err, {
    context: 'server.error_handler',
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  logSystemEvent('route_not_found', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(404).json({ error: 'Route not found' });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    logSystemEvent('database_connected', {
      uri: process.env.MONGODB_URI ? 'configured' : 'not_configured'
    });
    
    console.log('✅ Connected to MongoDB');
    
    // Initialize Firebase Admin SDK
    try {
      initializeFirebase();
      logSystemEvent('firebase_initialized');
    } catch (error) {
      logError(error, {
        context: 'server.firebase_init'
      });
      console.warn('⚠️ Firebase initialization failed:', error.message);
      console.log('📱 Push notifications will be disabled');
    }
    
    // Get the local IP address dynamically
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let localIP = 'localhost';
    
    // Find the first non-internal IPv4 address
    for (const name of Object.keys(interfaces)) {
      for (const interface of interfaces[name]) {
        if (interface.family === 'IPv4' && !interface.internal) {
          localIP = interface.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }
    
    // Listen on all network interfaces (0.0.0.0) to allow external connections
    app.listen(PORT, '0.0.0.0', () => {
      logSystemEvent('server_started', {
        port: PORT,
        environment: process.env.NODE_ENV,
        nodeVersion: process.version
      });
      
      console.log(`🚀 LifePulse API server running on port ${PORT}`);
      console.log(`📱 Environment: ${process.env.NODE_ENV}`);
      console.log(`🌐 Server accessible at:`);
      console.log(`   - Local: http://localhost:${PORT}`);
      console.log(`   - Network: http://${localIP}:${PORT}`);
      console.log(`   - Health check: http://${localIP}:${PORT}/health`);
      console.log(`📊 Logs directory: ./logs/`);
    });
  })
  .catch((error) => {
    logError(error, {
      context: 'server.mongodb_connection'
    });
    
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  logSystemEvent('server_shutdown', {
    signal: 'SIGTERM'
  });
  
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logSystemEvent('server_shutdown', {
    signal: 'SIGINT'
  });
  
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

module.exports = app;