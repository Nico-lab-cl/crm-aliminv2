// Script para probar el Webhook de Meta localmente
// Ejecuta: npx tsx scripts/test_webhook_meta.ts

async function testWebhook() {
  const url = "http://localhost:3000/api/webhooks/meta";
  
  const payload = {
    object: "page",
    entry: [
      {
        id: "PAGE_ID",
        time: Date.now(),
        messaging: [
          {
            sender: { id: "USER_PSID_TEST_123" },
            recipient: { id: "PAGE_ID" },
            timestamp: Date.now(),
            message: {
              mid: "mid.12345",
              text: "Hola, me interesa el proyecto Lomas del Mar! 👋"
            }
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", data);
  } catch (error) {
    console.error("Error testing webhook:", error);
  }
}

testWebhook();
