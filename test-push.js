// test-push.js
// Script para enviar una notificación nativa al teléfono del usuario Admin

const admin = require('firebase-admin');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config({ path: '.env' });

// ⚠️ REEMPLAZA ESTO CON EL TOKEN QUE VEAS EN LA CONSOLA DEL NAVEGADOR
// CÓMO CONSEGUIRLO:
// 1. Abre la web: https://crm.aliminlomasdelmar.com/
// 2. Click derecho -> Inspeccionar -> pestaña "Console"
// 3. Debería decir "FCM Token: fxxxxx..." o ejecuta: await AndroidBridge.getFcmToken()
const TOKEN_FCM = process.argv[2];

async function run() {
  if (!TOKEN_FCM) {
    console.error('❌ FALTÓ EL TOKEN.');
    console.log('   Uso: node test-push.js "fH1_K33...tu_token..."');
    process.exit(1);
  }

  // 1. Inicializar Firebase Admin
  if (!admin.apps.length) {
    console.log('🔄 Inicializando SDK de Firebase Admin...');
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // Corregir posibles saltos de línea escapados en entorno local
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      console.log('✅ SDK Inicializado.');
    } catch (error) {
      console.error('❌ Error inicializando Firebase:', error.message);
      process.exit(1);
    }
  }

  // 2. Preparar mensaje Android nativo Data-Only
  console.log('🔄 Enviando notificación Push...');
  const message = {
    data: {
      title: 'Notificación de Prueba 🚀',
      body: '¡Hola Nico! Si estás leyendo esto y tu teléfono vibró con la app abierta, TODO ESTÁ PERFECTO. 🎉',
      leadId: '',
      type: 'test',
    },
    android: {
      priority: 'high',
    },
    token: TOKEN_FCM,
  };

  // 3. Enviar
  try {
    const response = await admin.messaging().send(message);
    console.log('✅ NOTIFICACIÓN ENVIADA CON ÉXITO.');
    console.log('   ID del mensaje:', response);
    console.log('   Revisa tu celular (debería sonar y vibrar).');
  } catch (error) {
    console.error('❌ ERROR AL ENVIAR NOTIFICACIÓN:');
    console.error(error.message);
  } finally {
    process.exit(0);
  }
}

run();
