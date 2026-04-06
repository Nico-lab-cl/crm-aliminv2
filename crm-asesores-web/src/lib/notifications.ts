import prisma from "./prisma";
import admin from "./firebase-admin";

export async function createNotification({
  userId,
  title,
  body,
  type = "INFO",
  leadId,
}: {
  userId: string;
  title: string;
  body: string;
  type?: string;
  leadId?: string;
}) {
  try {
    // 1. Create notification in DB
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type,
        leadId,
      },
    });

    // 2. Send Push Notification via FCM if user has a token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });

    if ((user as any)?.fcmToken) {
      // Usamos un payload 'Data-Only' para forzar a Android a ejecutar SIEMPRE
      // MyFirebaseMessagingService.onMessageReceived, ya sea en background o foreground.
      // Esto garantiza que siempre vibre y suene con nuestro canal personalizado.
      const message = {
        data: {
          title: title,
          body: body,
          leadId: leadId || "",
          type: type,
        },
        android: {
          priority: "high" as const,
        },
        token: (user as any).fcmToken,
      };

      try {
        await admin.messaging().send(message);
        console.log(`Push notification sent to user ${userId}`);
      } catch (fcmError) {
        console.error("Error sending FCM message:", fcmError);
        // If token is invalid, we might want to clear it
        if ((fcmError as any).code === 'messaging/registration-token-not-registered') {
          await (prisma as any).user.update({
            where: { id: userId },
            data: { fcmToken: null }
          });
        }
      }
    }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}
