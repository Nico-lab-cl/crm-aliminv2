import axios from 'axios';

async function main() {
  const url = 'https://crm.aliminlomasdelmar.com/api/webhooks/migrate-and-import';
  const token = 'chris.2026'; // Admin token / password

  console.log(`Sending cleanup_advisors trigger to ${url}...`);

  try {
    const response = await axios.post(
      url,
      { action: 'cleanup_advisors' },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    console.log('[SUCCESS] Response from CRM server:');
    console.log(response.data);
  } catch (err: any) {
    console.error('[ERROR] Trigger failed:');
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(err.response.data);
    } else {
      console.error(err.message);
    }
  }
}

main();
