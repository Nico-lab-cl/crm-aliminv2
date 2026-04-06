import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import admin from "firebase-admin";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions as any);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const userId = (session as any).user?.id;
  const userName = (session as any).user?.name || "Usuario";

  // Diagnóstico de variables de entorno
  const envDiag = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? `✅ (${process.env.FIREBASE_PROJECT_ID})` : "❌ FALTA",
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? `✅ (${process.env.FIREBASE_CLIENT_EMAIL.substring(0, 20)}...)` : "❌ FALTA",
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY 
      ? `✅ (${process.env.FIREBASE_PRIVATE_KEY.substring(0, 30)}... longitud: ${process.env.FIREBASE_PRIVATE_KEY.length})` 
      : "❌ FALTA",
    FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? `✅ (longitud: ${process.env.FIREBASE_SERVICE_ACCOUNT_KEY.length})` : "❌ FALTA",
    firebaseAppsCount: admin.apps.length,
  };

  // Intentar inicializar Firebase si no está listo
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    // Si no tenemos las variables individuales, intentar con el JSON del service account
    if (!privateKey && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      let serviceAccount;
      try {
        // Intentar decodificar como base64 primero
        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(decoded);
      } catch (e) {
        // Fallback: tratar como JSON crudo
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        } catch (parseErr: any) {
          (envDiag as any).jsonParseError = parseErr.message;
        }
      }

      if (serviceAccount) {
        try {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          (envDiag as any).initMethod = "SERVICE_ACCOUNT_KEY JSON (Base64/Raw)";
        } catch (err: any) {
          return NextResponse.json({
            success: false,
            error: "INIT_FAILED_JSON",
            message: err.message,
            envDiag,
          }, { status: 500 });
        }
      }
    }

    // Si tenemos las variables individuales
    if (!admin.apps.length && projectId && clientEmail && privateKey) {
      // Limpiar la private key
      privateKey = privateKey
        .replace(/\\n/g, '\n')       // escaped newlines
        .replace(/^["']|["']$/g, ''); // remove surrounding quotes
      
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        (envDiag as any).initMethod = "Individual ENV vars";
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          error: "INIT_FAILED_INDIVIDUAL",
          message: err.message,
          privateKeyStart: privateKey.substring(0, 40),
          privateKeyEnd: privateKey.substring(privateKey.length - 40),
          envDiag,
        }, { status: 500 });
      }
    }

    if (!admin.apps.length) {
      return NextResponse.json({
        success: false,
        error: "CANNOT_INIT",
        message: "No se pudo inicializar Firebase. Faltan variables de entorno.",
        envDiag,
      }, { status: 500 });
    }
  }

  try {
    // Check if user has FCM token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true, name: true },
    });

    if (!user?.fcmToken) {
      return NextResponse.json({
        success: false,
        error: "NO_TOKEN",
        message: `El usuario ${userName} NO tiene token FCM registrado.`,
        envDiag,
      }, { status: 400 });
    }

    // Send test push
    const message = {
      data: {
        title: "🚀 Notificación de Prueba",
        body: `¡Hola ${userName}! Si ves esto, las notificaciones funcionan PERFECTO. 🎉`,
        leadId: "",
        type: "test",
      },
      android: {
        priority: "high" as const,
      },
      token: user.fcmToken,
    };

    const response = await admin.messaging().send(message);

    return NextResponse.json({
      success: true,
      message: `¡Notificación enviada a ${userName}! Revisa tu celular.`,
      firebaseMessageId: response,
      tokenPrefix: user.fcmToken.substring(0, 30) + "...",
      envDiag,
    });

  } catch (error: any) {
    if (error.code === "messaging/registration-token-not-registered") {
      await prisma.user.update({
        where: { id: userId },
        data: { fcmToken: null },
      });
    }
    return NextResponse.json({
      success: false,
      error: error.code || "SEND_FAILED",
      message: error.message,
      envDiag,
    }, { status: 500 });
  }
}
