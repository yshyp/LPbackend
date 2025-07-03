# LifePulse - Blood Donor Mobile App

A full-stack blood donor mobile application built with React Native (Expo) frontend and Node.js/Express/MongoDB backend. The app connects blood donors with requesters in real-time using location-based matching and push notifications.

## 🩸 Features

### For Donors
- **Availability Toggle**: Mark yourself as available/unavailable for donations
- **Nearby Requests**: View blood requests within 50km radius
- **Real-time Notifications**: Get notified of urgent blood requests
- **Request Acceptance**: Accept blood requests with one tap
- **Location Sharing**: Share your location for better matching

### For Requesters
- **Blood Request Creation**: Create detailed blood requests
- **Urgency Levels**: Set urgency (LOW, MEDIUM, HIGH, CRITICAL)
- **Donor Matching**: Automatically find nearby available donors
- **Request Tracking**: Track accepted donors and request status
- **Push Notifications**: Get notified when donors accept requests

### Technical Features
- **Real-time Push Notifications**: Using Firebase Cloud Messaging
- **Geospatial Queries**: MongoDB geospatial indexing for location-based matching
- **JWT Authentication**: Secure user authentication
- **Responsive Design**: Modern UI with consistent theming
- **Cross-platform**: Works on both iOS and Android

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud)
- Expo CLI (`npm install -g expo-cli`)
- Firebase project (for push notifications)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd lifepulse
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Install frontend dependencies**
```bash
cd ../frontend
npm install
```

4. **Set up environment variables**
```bash
cd ../backend
cp env.example .env
# Edit .env with your configuration
```

5. **Set up Firebase (for push notifications)**
```bash
# Run the Firebase setup helper
node setup-firebase.js
```

### Configuration

#### Backend Environment Variables (`backend/.env`)
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/lifepulse

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Firebase Configuration (for push notifications)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_PRIVATE_KEY_ID=your-private-key-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour Private Key Here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project.iam.gserviceaccount.com

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
```

## 🔥 Firebase Setup

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Cloud Messaging

### Step 2: Generate Service Account Key
1. Go to Project Settings → Service Accounts
2. Click "Generate new private key"
3. Download the JSON file

### Step 3: Configure Backend
Use the provided setup script:
```bash
node setup-firebase.js
```

Or manually add Firebase configuration to your `.env` file.

### Step 4: Test Notifications
1. Start the backend server
2. Run the mobile app
3. Use the "Test Notifications" feature in the app

## 🏃‍♂️ Running the Application

### Backend Server
```bash
cd backend
npm start
```

The server will start on `http://localhost:5000`

### Frontend (Mobile App)
```bash
cd frontend
expo start
```

Scan the QR code with Expo Go app on your phone, or press `a` for Android emulator or `i` for iOS simulator.

## 📱 App Screenshots

### Login & Registration
- Clean authentication flow
- Role selection (Donor/Requester)
- Blood group selection

### Donor Dashboard
- Availability toggle
- Nearby blood requests list
- Urgency indicators
- One-tap request acceptance

### Requester Dashboard
- Blood request creation modal
- Request history
- Accepted donors list
- Status tracking

### Notifications
- Real-time push notifications
- Unread indicators
- Notification history

## 🛠️ API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Users
- `GET /api/users/me` - Get user profile
- `PUT /api/users/me/location` - Update location
- `PUT /api/users/me/availability` - Toggle availability
- `PUT /api/users/me/fcm-token` - Update FCM token

### Blood Requests
- `GET /api/requests` - List nearby requests (donors)
- `POST /api/requests` - Create blood request (requesters)
- `POST /api/requests/:id/accept` - Accept request (donors)

### Notifications
- `POST /api/notifications/push` - Send push notification
- `POST /api/notifications/request-created` - Notify nearby donors
- `POST /api/notifications/request-accepted` - Notify requester

## 🗄️ Database Schema

### User Model
```javascript
{
  name: String,
  phone: String,
  role: 'DONOR' | 'REQUESTER',
  bloodGroup: String,
  location: {
    type: 'Point',
    coordinates: [longitude, latitude]
  },
  isAvailable: Boolean,
  fcmToken: String,
  lastDonation: Date
}
```

### Blood Request Model
```javascript
{
  requester: ObjectId,
  bloodGroup: String,
  units: Number,
  hospitalName: String,
  hospitalAddress: String,
  location: {
    type: 'Point',
    coordinates: [longitude, latitude]
  },
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  requiredBy: Date,
  status: 'ACTIVE' | 'FULFILLED' | 'EXPIRED',
  acceptedDonors: [{
    donor: ObjectId,
    acceptedAt: Date
  }]
}
```

## 🔧 Development

### Project Structure
```
lifepulse/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── firebase.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   └── BloodRequest.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── requests.js
│   │   │   └── notifications.js
│   │   └── server.js
│   ├── package.json
│   └── env.example
├── frontend/
│   ├── App.js
│   ├── package.json
│   └── assets/
├── setup-firebase.js
├── FIREBASE_SETUP.md
└── README.md
```

### Key Technologies
- **Backend**: Node.js, Express, MongoDB, Mongoose
- **Frontend**: React Native, Expo
- **Authentication**: JWT
- **Push Notifications**: Firebase Cloud Messaging
- **Location**: Expo Location API
- **Geospatial**: MongoDB geospatial queries

## 🧪 Testing

### Backend Testing
```bash
cd backend
npm test
```

### Frontend Testing
```bash
cd frontend
npm test
```

### Manual Testing
1. Create test users (donor and requester)
2. Test blood request creation
3. Test notification delivery
4. Test location-based matching

## 🚀 Deployment

### Backend Deployment
1. Set production environment variables
2. Deploy to your preferred platform (Heroku, AWS, etc.)
3. Set up MongoDB Atlas for production database

### Frontend Deployment
1. Build the app: `expo build:android` or `expo build:ios`
2. Upload to app stores
3. Configure production Firebase project

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

If you encounter any issues:

1. Check the [Firebase Setup Guide](FIREBASE_SETUP.md)
2. Review the troubleshooting section
3. Check backend logs for errors
4. Verify environment variables are set correctly

## 🙏 Acknowledgments

- Firebase for push notification infrastructure
- Expo for the development platform
- MongoDB for the database
- React Native community for the ecosystem

---

**LifePulse** - Connecting donors with those in need, one drop at a time. 🩸 