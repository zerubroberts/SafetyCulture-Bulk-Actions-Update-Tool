// Quick test to see the API response structure
require('dotenv').config();
const API_KEY = process.env.SAFETYCULTURE_API_KEY;

async function test() {
  const response = await fetch('https://api.safetyculture.io/tasks/v1/actions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Test Action - Delete Me',
      description: 'Testing API response structure',
    }),
  });

  console.log('Status:', response.status);
  const result = await response.json();
  console.log('Full Response:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
