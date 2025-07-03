const fs = require('fs');
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log formats
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'lifepulse-api' },
  transports: [
    // Error logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    
    // Combined logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    
    // OTP specific logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'otp-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '7d',
      zippedArchive: true
    }),
    
    // User activity logs
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'user-activity-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true
    })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

// Helper functions for different log types
const logOTP = (action, phone, type, details = {}) => {
  logger.log('info', `OTP ${action}`, {
    phone: phone.replace(/\d(?=\d{4})/g, '*'), // Mask phone number
    type,
    ...details,
    logType: 'OTP'
  });
};

const logUserActivity = (action, userId, phone, details = {}) => {
  logger.log('info', `User ${action}`, {
    userId,
    phone: phone ? phone.replace(/\d(?=\d{4})/g, '*') : undefined,
    ...details,
    logType: 'USER_ACTIVITY'
  });
};

const logSystemEvent = (event, details = {}) => {
  logger.log('info', `System ${event}`, {
    ...details,
    logType: 'SYSTEM'
  });
};

const logError = (error, context = {}) => {
  logger.log('error', error.message, {
    stack: error.stack,
    ...context,
    logType: 'ERROR'
  });
};

const logSecurity = (event, details = {}) => {
  logger.log('warn', `Security ${event}`, {
    ...details,
    logType: 'SECURITY'
  });
};

module.exports = {
  logger,
  logOTP,
  logUserActivity,
  logSystemEvent,
  logError,
  logSecurity
}; 