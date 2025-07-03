const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function testRegistration() {
  try {
    console.log('🧪 Testing registration with various phone scenarios...\n');

    // Test 1: Registration with valid phone
    console.log('📱 Test 1: Registration with valid phone number');
    try {
      const response1 = await axios.post(`${API_BASE_URL}/auth/register-verified`, {
        name: 'Test User 1',
        email: 'test1@example.com',
        phone: '+1234567890',
        bloodGroup: 'A+',
        role: 'DONOR'
      });
      console.log('✅ Success:', response1.data.message);
    } catch (error) {
      console.log('❌ Error:', error.response?.data?.error || error.message);
    }

    // Test 2: Registration with null phone
    console.log('\n📱 Test 2: Registration with null phone');
    try {
      const response2 = await axios.post(`${API_BASE_URL}/auth/register-verified`, {
        name: 'Test User 2',
        email: 'test2@example.com',
        phone: null,
        bloodGroup: 'B+',
        role: 'REQUESTER'
      });
      console.log('✅ Success:', response2.data.message);
    } catch (error) {
      console.log('❌ Error:', error.response?.data?.error || error.message);
    }

    // Test 3: Registration with empty phone
    console.log('\n📱 Test 3: Registration with empty phone');
    try {
      const response3 = await axios.post(`${API_BASE_URL}/auth/register-verified`, {
        name: 'Test User 3',
        email: 'test3@example.com',
        phone: '',
        bloodGroup: 'O+',
        role: 'DONOR'
      });
      console.log('✅ Success:', response3.data.message);
    } catch (error) {
      console.log('❌ Error:', error.response?.data?.error || error.message);
    }

    // Test 4: Registration with undefined phone
    console.log('\n📱 Test 4: Registration with undefined phone');
    try {
      const response4 = await axios.post(`${API_BASE_URL}/auth/register-verified`, {
        name: 'Test User 4',
        email: 'test4@example.com',
        phone: undefined,
        bloodGroup: 'AB+',
        role: 'REQUESTER'
      });
      console.log('✅ Success:', response4.data.message);
    } catch (error) {
      console.log('❌ Error:', error.response?.data?.error || error.message);
    }

    // Test 5: Registration with only email (no phone)
    console.log('\n📱 Test 5: Registration with only email (no phone field)');
    try {
      const response5 = await axios.post(`${API_BASE_URL}/auth/register-verified`, {
        name: 'Test User 5',
        email: 'test5@example.com',
        bloodGroup: 'A-',
        role: 'DONOR'
      });
      console.log('✅ Success:', response5.data.message);
    } catch (error) {
      console.log('❌ Error:', error.response?.data?.error || error.message);
    }

    console.log('\n🎉 Registration tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Check if server is running
async function checkServer() {
  try {
    await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ Server is running');
    return true;
  } catch (error) {
    console.log('❌ Server is not running. Please start the server first.');
    return false;
  }
}

async function runTests() {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await testRegistration();
  }
}

runTests(); 