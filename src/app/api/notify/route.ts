import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const { token, title, body } = await req.json();

    if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 });

    const message = {
      notification: {
        title: title || 'Nuevo Lead',
        body: body || 'Has recibido un nuevo lead del CRM.',
      },
      token: token,
    };

    const response = await admin.messaging().send(message);
    return NextResponse.json({ success: true, messageId: response });
  } catch (error) {
    console.error('Firebase Error:', error);
    return NextResponse.json({ error: 'Notification failed' }, { status: 500 });
  }
}
