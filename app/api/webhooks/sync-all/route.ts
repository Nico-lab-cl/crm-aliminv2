import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await queryMain(`
      SELECT * FROM "Lead" 
      WHERE id IN ('0a85ea8a-7cfe-416f-bc4c-688b713f930a', '47430740-256d-4abf-952e-daae8c72fb25')
    `);
    
    return NextResponse.json({
      success: true,
      leads: res.rows
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
