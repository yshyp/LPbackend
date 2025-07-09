# LifePulse Backend API

A comprehensive blood donation management system backend built with Node.js, Express, and MongoDB.

## 🚀 Features

- **User Authentication & Authorization**
  - JWT-based authentication
  - Role-based access control (Donor, Seeker, Admin)
  - OTP verification via SMS/Email
  - Secure password handling with bcrypt

- **User Management**
  - User registration and profile management
  - Blood group and medical history tracking
  - Location-based services
  - Donation eligibility checking

- **Blood Request System**
  - Create and manage blood requests
  - Real-time request matching
  - Priority-based request handling
  - Request status tracking

- **Notification System**
  - Push notifications via FCM
  - Email notifications
  - SMS notifications
  - Real-time updates

- **Analytics & Reporting**
  - Donation statistics
  - User activity tracking
  - Request fulfillment metrics
  - Leaderboard system

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer
- **Email**: Nodemailer
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **SMS**: Twilio/TextLocal
- **Validation**: Joi
- **Security**: Helmet, CORS, Rate Limiting
- **Environment**: dotenv

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Firebase project for FCM
- Email service credentials (Gmail/SMTP)
- SMS service credentials (Twilio/TextLocal)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lifepulse/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   
   Create a `.env` file in the backend root directory:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # Database
   MONGODB_URI=mongodb://localhost:27017/lifepulse

   # JWT Secret
   JWT_SECRET=your_super_secure_jwt_secret_key_here

   # Email Configuration (Gmail)
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password

   # SMS Configuration (TextLocal)
   TEXTLOCAL_API_KEY=your_textlocal_api_key
   TEXTLOCAL_SENDER=TXTLCL

   # Firebase FCM
   FIREBASE_PROJECT_ID=your_firebase_project_id
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

   # File Upload
   UPLOAD_PATH=./uploads
   MAX_FILE_SIZE=5242880

   # Rate Limiting
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

4. **Start MongoDB**
   ```bash
   # If using local MongoDB
   mongod

   # Or ensure your MongoDB Atlas connection is working
   ```

5. **Run the application**
   ```bash
   # Development mode with nodemon
   npm run dev

   # Production mode
   npm start
   ```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js      # MongoDB connection
│   │   ├── firebase.js      # Firebase configuration
│   │   └── email.js         # Email configuration
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── requestController.js
│   │   ├── notificationController.js
│   │   └── verificationController.js
│   ├── middleware/
│   │   ├── auth.js          # Authentication middleware
│   │   ├── validation.js    # Input validation
│   │   ├── upload.js        # File upload handling
│   │   └── rateLimiter.js   # Rate limiting
│   ├── models/
│   │   ├── User.js
│   │   ├── Request.js
│   │   ├── Notification.js
│   │   └── Verification.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── requests.js
│   │   ├── notifications.js
│   │   └── verification.js
│   ├── services/
│   │   ├── emailService.js
│   │   ├── smsService.js
│   │   ├── notificationService.js
│   │   └── verificationService.js
│   └── utils/
│       ├── helpers.js
│       ├── validators.js
│       └── constants.js
├── uploads/                 # File upload directory
├── .env                    # Environment variables
├── .gitignore
├── package.json
└── server.js               # Entry point
```

## 🔗 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - User logout

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `PUT /api/users/location` - Update user location
- `GET /api/users/eligibility` - Check donation eligibility
- `POST /api/users/fcm-token` - Register FCM token

### Blood Requests
- `GET /api/requests` - Get blood requests
- `POST /api/requests` - Create blood request
- `PUT /api/requests/:id` - Update blood request
- `DELETE /api/requests/:id` - Delete blood request
- `POST /api/requests/:id/respond` - Respond to request

### Notifications
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications/test` - Send test notification
- `PUT /api/notifications/:id/read` - Mark notification as read

### Verification
- `POST /api/verification/send` - Send OTP
- `POST /api/verification/verify` - Verify OTP

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --grep "User Authentication"
```

## 🚀 Deployment

### Using PM2 (Recommended)

1. **Install PM2 globally**
   ```bash
   npm install -g pm2
   ```

2. **Create ecosystem file**
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'lifepulse-backend',
       script: 'server.js',
       cwd: './src',
       instances: 'max',
       exec_mode: 'cluster',
       env: {
         NODE_ENV: 'development'
       },
       env_production: {
         NODE_ENV: 'production',
         PORT: 5000
       }
     }]
   };
   ```

3. **Deploy with PM2**
   ```bash
   pm2 start ecosystem.config.js --env production
   pm2 save
   pm2 startup
   ```

### Using Docker

1. **Create Dockerfile**
   ```dockerfile
   FROM node:16-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   EXPOSE 5000
   CMD ["npm", "start"]
   ```

2. **Build and run**
   ```bash
   docker build -t lifepulse-backend .
   docker run -p 5000:5000 --env-file .env lifepulse-backend
   ```

## 🔒 Security Features

- **JWT Authentication** with secure token generation
- **Rate Limiting** to prevent abuse
- **Input Validation** using Joi schemas
- **CORS Configuration** for cross-origin requests
- **Helmet** for security headers
- **Password Hashing** using bcrypt
- **File Upload Security** with type and size validation

## 📊 Monitoring & Logging

- **Morgan** for HTTP request logging
- **Winston** for application logging
- **Health Check** endpoint at `/api/health`
- **Performance monitoring** with built-in metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support and questions:
- Email: support@lifepulse.com
- Documentation: [API Docs](https://api.lifepulse.com/docs)
- Issues: [GitHub Issues](https://github.com/your-repo/lifepulse/issues)

## 🙏 Acknowledgments

- Express.js team for the excellent framework
- MongoDB team for the robust database
- Firebase team for notification services
- All contributors who helped build this project