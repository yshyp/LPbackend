const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function testAPIEndpoint() {
  try {
    console.log('🧪 Testing API endpoint for requester dashboard...\n');
    
    // First, let's login as a requester to get a token
    console.log('🔐 Logging in as requester...');
    
    // Try to login with the requester account
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      phone: 'ysakhyp@live.in', // This is the requester's email/phone
      password: 'password123' // You might need to adjust this
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    // Now test the donations endpoint (which returns requests for requesters)
    console.log('\n📋 Testing /api/users/me/donations endpoint...');
    
    const donationsResponse = await axios.get(`${API_BASE_URL}/users/me/donations`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ API Response:');
    console.log(JSON.stringify(donationsResponse.data, null, 2));
    
    // Check if accepted donors are populated
    if (donationsResponse.data.donations && donationsResponse.data.donations.length > 0) {
      donationsResponse.data.donations.forEach((request, index) => {
        console.log(`\n📋 Request ${index + 1}:`);
        console.log(`  Blood Group: ${request.bloodGroup}`);
        console.log(`  Status: ${request.status}`);
        console.log(`  Accepted Donors: ${request.acceptedDonors?.length || 0}`);
        
        if (request.acceptedDonors && request.acceptedDonors.length > 0) {
          request.acceptedDonors.forEach((accepted, donorIndex) => {
            console.log(`    Donor ${donorIndex + 1}:`);
            console.log(`      Name: ${accepted.donor?.name || 'NOT POPULATED'}`);
            console.log(`      Email: ${accepted.donor?.email || 'NOT POPULATED'}`);
            console.log(`      Phone: ${accepted.donor?.phone || 'NOT POPULATED'}`);
            console.log(`      Blood Group: ${accepted.donor?.bloodGroup || 'NOT POPULATED'}`);
            console.log(`      Status: ${accepted.status}`);
          });
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error testing API endpoint:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n💡 Try creating a new user or check the login credentials');
    }
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
    await testAPIEndpoint();
  }
}

runTests(); 