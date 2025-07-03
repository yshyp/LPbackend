# LifePulse Admin Dashboard Guide

## Overview

The LifePulse Admin Dashboard provides comprehensive administrative capabilities for managing the blood donation platform. It includes user management, blood request monitoring, system logs, and analytics.

## Features

### 🔐 Authentication & Security
- **Multi-role Admin System**: SUPER_ADMIN, ADMIN, MODERATOR
- **Permission-based Access Control**: Granular permissions for different operations
- **Account Locking**: Automatic account lockout after failed login attempts
- **JWT Token Authentication**: Secure session management
- **Rate Limiting**: Protection against brute force attacks

### 👥 User Management
- **View All Users**: Donors and requesters with detailed information
- **User Statistics**: Role-based analytics and verification status
- **User Details**: Complete user profiles with donation/request history
- **Account Management**: Activate/deactivate user accounts
- **Search & Filter**: Find users by role, blood group, verification status

### 🩸 Blood Request Management
- **Request Monitoring**: View all blood requests with status tracking
- **Request Details**: Complete request information with donor acceptance
- **Status Management**: Update request status and add admin notes
- **Analytics**: Request statistics by status, blood group, urgency
- **Search & Filter**: Find requests by various criteria

### 📊 Analytics & Dashboard
- **Real-time Statistics**: User counts, request metrics, admin stats
- **Recent Activity**: Latest users and requests
- **Performance Metrics**: System usage and activity trends
- **Visual Reports**: Data visualization for better insights

### 📝 System Logs
- **Comprehensive Logging**: All system activities and user actions
- **Log Filtering**: Search by level, date range, keywords
- **Log Statistics**: Error rates, activity patterns, security events
- **Real-time Monitoring**: Live log viewing and analysis

### 👨‍💼 Admin Management (Super Admin Only)
- **Admin Accounts**: Create, update, and manage admin users
- **Role Assignment**: Assign roles and permissions
- **Account Unlocking**: Unlock locked admin accounts
- **Admin Statistics**: Monitor admin activity and performance

## API Endpoints

### Authentication
```
POST /api/admin/login
GET /api/admin/profile
PUT /api/admin/profile
PUT /api/admin/change-password
```

### Dashboard & Analytics
```
GET /api/admin/dashboard/stats
```

### User Management
```
GET /api/admin/users
GET /api/admin/users/:userId
PUT /api/admin/users/:userId/status
```

### Blood Request Management
```
GET /api/admin/requests
GET /api/admin/requests/:requestId
PUT /api/admin/requests/:requestId/status
```

### System Logs
```
GET /api/admin/logs
GET /api/admin/logs/stats
```

### Admin Management (Super Admin Only)
```
GET /api/admin/admins
POST /api/admin/admins
PUT /api/admin/admins/:adminId
PUT /api/admin/admins/:adminId/unlock
```

## Admin Roles & Permissions

### SUPER_ADMIN
- Full system access
- Manage all admin accounts
- System settings configuration
- All permissions enabled

### ADMIN
- View and edit users
- View and edit requests
- View logs and analytics
- Limited admin management

### MODERATOR
- View users and requests
- View logs
- Basic analytics access
- No editing permissions

## Permission Matrix

| Permission | SUPER_ADMIN | ADMIN | MODERATOR |
|------------|-------------|-------|-----------|
| viewUsers | ✅ | ✅ | ✅ |
| editUsers | ✅ | ✅ | ❌ |
| deleteUsers | ✅ | ❌ | ❌ |
| viewRequests | ✅ | ✅ | ✅ |
| editRequests | ✅ | ✅ | ❌ |
| deleteRequests | ✅ | ❌ | ❌ |
| viewLogs | ✅ | ✅ | ✅ |
| viewAnalytics | ✅ | ✅ | ✅ |
| manageAdmins | ✅ | ❌ | ❌ |
| systemSettings | ✅ | ❌ | ❌ |

## Security Features

### Account Protection
- **Password Hashing**: Bcrypt with salt rounds
- **Login Attempt Tracking**: Monitor failed login attempts
- **Account Lockout**: Automatic lockout after 5 failed attempts
- **Session Management**: JWT tokens with expiration
- **IP Tracking**: Log admin login locations

### Data Protection
- **Sensitive Data Masking**: Email addresses and personal info
- **Audit Logging**: Complete activity tracking
- **Permission Validation**: Server-side permission checks
- **Input Validation**: Comprehensive request validation

## Setup Instructions

### 1. Environment Configuration
Ensure your `.env` file includes:
```env
JWT_SECRET=your_jwt_secret_here
MONGODB_URI=your_mongodb_connection_string
```

### 2. Create Super Admin
Run the test script to create the initial super admin:
```bash
cd backend
node test-admin.js
```

### 3. Default Super Admin Credentials
- **Username**: superadmin
- **Email**: admin@lifepulse.com
- **Password**: Admin@123456

### 4. Access Admin Dashboard
- **Base URL**: `http://localhost:5000/api/admin`
- **Login Endpoint**: `POST /api/admin/login`

## Usage Examples

### Login as Admin
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "superadmin",
    "password": "Admin@123456"
  }'
```

### Get Dashboard Statistics
```bash
curl -X GET http://localhost:5000/api/admin/dashboard/stats \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### View All Users
```bash
curl -X GET "http://localhost:5000/api/admin/users?page=1&limit=10&role=donor" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### View System Logs
```bash
curl -X GET "http://localhost:5000/api/admin/logs?level=error&limit=50" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Monitoring & Maintenance

### Regular Tasks
1. **Review System Logs**: Check for errors and security events
2. **Monitor User Activity**: Track user registration and activity patterns
3. **Review Blood Requests**: Monitor request completion rates
4. **Admin Account Management**: Review admin access and permissions
5. **Performance Monitoring**: Track API response times and usage

### Security Best Practices
1. **Regular Password Changes**: Enforce admin password updates
2. **Permission Reviews**: Regularly audit admin permissions
3. **Log Analysis**: Monitor for suspicious activities
4. **Account Cleanup**: Deactivate unused admin accounts
5. **Backup Verification**: Ensure log and data backups

## Troubleshooting

### Common Issues

#### Admin Login Fails
- Check if account is locked (too many failed attempts)
- Verify username/email and password
- Check if account is active
- Review login logs for details

#### Permission Denied
- Verify admin role and permissions
- Check if required permission is enabled
- Review admin account status
- Contact super admin for permission updates

#### Log Access Issues
- Ensure logs directory exists and is readable
- Check file permissions on log files
- Verify admin has viewLogs permission
- Review server logs for errors

### Support
For technical support or issues:
1. Check system logs for error details
2. Review admin activity logs
3. Verify environment configuration
4. Contact system administrator

## API Response Format

All admin API responses follow this format:
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  }
}
```

Error responses:
```json
{
  "success": false,
  "message": "Error description"
}
```

## Rate Limits

- **Login Attempts**: 5 attempts per 15 minutes
- **API Requests**: 100 requests per 15 minutes per IP
- **Log Queries**: 50 log entries per request
- **User/Request Lists**: 10 items per page by default

## Logging

All admin activities are logged with:
- **User Activity**: Admin actions and operations
- **Security Events**: Login attempts, permission checks
- **System Events**: API usage and performance
- **Error Logs**: Failed operations and exceptions

Log files are stored in `backend/logs/` with daily rotation and retention policies. 