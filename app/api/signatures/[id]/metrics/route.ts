import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // 1. Verificar si la firma existe
    const sigCheck = await queryMarketing(
      'SELECT name FROM email_signatures WHERE id = $1',
      [id]
    );

    if (sigCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Firma de correo no encontrada.' },
        { status: 404 }
      );
    }

    const signatureName = sigCheck.rows[0].name;

    // 2. Ejecutar consultas métricas paralelamente para máxima velocidad
    const [
      totalsRes,
      elementsRes,
      historyRes,
      geoRes,
      techRes
    ] = await Promise.all([
      // Total y Clics Únicos (por IP)
      queryMarketing(`
        SELECT 
          COUNT(*)::int as total_clicks,
          COUNT(DISTINCT ip_address)::int as unique_clicks
        FROM signature_clicks 
        WHERE signature_id = $1
      `, [id]),

      // Clics por Elemento / Sección
      queryMarketing(`
        SELECT 
          element, 
          COUNT(*)::int as clicks
        FROM signature_clicks 
        WHERE signature_id = $1
        GROUP BY element
        ORDER BY clicks DESC
      `, [id]),

      // Clics por Día (Historial últimos 30 días)
      queryMarketing(`
        SELECT 
          DATE_TRUNC('day', clicked_at AT TIME ZONE 'UTC')::date as click_date,
          COUNT(*)::int as clicks
        FROM signature_clicks 
        WHERE signature_id = $1 AND clicked_at >= NOW() - INTERVAL '30 days'
        GROUP BY click_date
        ORDER BY click_date ASC
      `, [id]),

      // Distribución Geográfica (Países y Ciudades)
      queryMarketing(`
        SELECT 
          country, 
          city,
          COUNT(*)::int as clicks
        FROM signature_clicks 
        WHERE signature_id = $1
        GROUP BY country, city
        ORDER BY clicks DESC
        LIMIT 20
      `, [id]),

      // Distribución Tecnológica (Dispositivo, OS, Browser)
      queryMarketing(`
        SELECT 
          device,
          os,
          browser,
          COUNT(*)::int as clicks
        FROM signature_clicks 
        WHERE signature_id = $1
        GROUP BY device, os, browser
      `, [id])
    ]);

    // 3. Formatear y agrupar resultados de tecnología de forma separada para facilitar consumo
    const deviceStats: Record<string, number> = {};
    const osStats: Record<string, number> = {};
    const browserStats: Record<string, number> = {};

    techRes.rows.forEach(row => {
      const clicks = row.clicks;
      
      const dev = row.device || 'Desktop';
      deviceStats[dev] = (deviceStats[dev] || 0) + clicks;
      
      const os = row.os || 'Unknown OS';
      osStats[os] = (osStats[os] || 0) + clicks;
      
      const browser = row.browser || 'Unknown Browser';
      browserStats[browser] = (browserStats[browser] || 0) + clicks;
    });

    const metricsData = {
      signatureId: id,
      name: signatureName,
      summary: {
        totalClicks: totalsRes.rows[0]?.total_clicks || 0,
        uniqueClicks: totalsRes.rows[0]?.unique_clicks || 0
      },
      elements: elementsRes.rows,
      history: historyRes.rows.map(h => ({
        date: h.click_date.toISOString().split('T')[0],
        clicks: h.clicks
      })),
      geography: geoRes.rows,
      technology: {
        devices: Object.entries(deviceStats).map(([name, clicks]) => ({ name, clicks })),
        operatingSystems: Object.entries(osStats).map(([name, clicks]) => ({ name, clicks })),
        browsers: Object.entries(browserStats).map(([name, clicks]) => ({ name, clicks }))
      }
    };

    return NextResponse.json(metricsData);
  } catch (error) {
    console.error('Error compiling signature metrics:', error);
    return NextResponse.json(
      { error: 'Error al compilar las métricas de la firma.' },
      { status: 500 }
    );
  }
}
