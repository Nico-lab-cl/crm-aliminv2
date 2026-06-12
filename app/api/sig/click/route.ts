import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Función para parsear el User Agent de forma rápida y sin dependencias externas
function parseUserAgent(ua: string) {
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  let device = 'Desktop';

  const uaLower = ua.toLowerCase();

  // Detectar Dispositivo
  if (/mobile|android|iphone|ipad|phone/i.test(uaLower)) {
    if (/ipad|tablet/i.test(uaLower)) {
      device = 'Tablet';
    } else {
      device = 'Mobile';
    }
  } else if (/bot|crawler|spider|googlebot|bingbot|yandex|yahoo|baidu/i.test(uaLower)) {
    device = 'Bot';
  }

  // Detectar Sistema Operativo (OS)
  if (/iphone|ipad|ipod/i.test(uaLower)) {
    os = 'iOS';
  } else if (/windows/i.test(uaLower)) {
    os = 'Windows';
  } else if (/macintosh|mac os x/i.test(uaLower)) {
    os = 'macOS';
  } else if (/android/i.test(uaLower)) {
    os = 'Android';
  } else if (/linux/i.test(uaLower)) {
    os = 'Linux';
  }

  // Detectar Navegador
  if (/chrome|crios/i.test(uaLower) && !/edge|edg/i.test(uaLower) && !/opr/i.test(uaLower)) {
    browser = 'Chrome';
  } else if (/safari/i.test(uaLower) && !/chrome|crios/i.test(uaLower)) {
    browser = 'Safari';
  } else if (/firefox|fxios/i.test(uaLower)) {
    browser = 'Firefox';
  } else if (/edge|edg/i.test(uaLower)) {
    browser = 'Edge';
  } else if (/opera|opr/i.test(uaLower)) {
    browser = 'Opera';
  } else if (/msie|trident/i.test(uaLower)) {
    browser = 'Internet Explorer';
  }

  return { browser, os, device };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sigId = searchParams.get('sid');
  const element = searchParams.get('el') || 'unknown';
  const encodedUrl = searchParams.get('url');

  const fallbackUrl = 'https://aliminspa.cl';
  let destinationUrl = fallbackUrl;

  if (encodedUrl) {
    try {
      // Intentar decodificar Base64
      const decoded = Buffer.from(encodedUrl, 'base64').toString('utf8');
      if (decoded && (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('mailto:') || decoded.startsWith('tel:'))) {
        destinationUrl = decoded;
      } else {
        // Si no empieza con protocolo, intentar usar la decodificada directa o decodificar el uri component
        destinationUrl = decodeURIComponent(encodedUrl);
      }
    } catch (e) {
      // Si falla base64, usar decodeURIComponent
      try {
        destinationUrl = decodeURIComponent(encodedUrl);
      } catch (err) {
        console.error('Failed to decode destination url:', encodedUrl, err);
      }
    }
  }

  if (!sigId) {
    console.warn('Signature click warning: Missing signature ID (sid).');
    return new Response(null, {
      status: 302,
      headers: { 'Location': destinationUrl }
    });
  }

  try {
    // 1. Extraer detalles del cliente
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
               request.headers.get('x-real-ip')?.trim() || 
               '127.0.0.1';
    
    const userAgent = request.headers.get('user-agent') || '';
    const referrer = request.headers.get('referer') || '';

    const { browser, os, device } = parseUserAgent(userAgent);

    // 2. Geolocalización por IP con un timeout estricto para no ralentizar la redirección
    let country = 'Unknown';
    let city = 'Unknown';
    let region = 'Unknown';
    let latitude: number | null = null;
    let longitude: number | null = null;

    // Solo geolocalizar IPs públicas reales
    if (ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
      try {
        const geoPromise = fetch(`https://ipwhois.app/json/${ip}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.success) {
              return {
                country: data.country || 'Unknown',
                city: data.city || 'Unknown',
                region: data.region || 'Unknown',
                latitude: data.latitude ? parseFloat(data.latitude) : null,
                longitude: data.longitude ? parseFloat(data.longitude) : null
              };
            }
            return null;
          });

        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 850));
        const geoResult = await Promise.race([geoPromise, timeoutPromise]) as any;
        
        if (geoResult) {
          country = geoResult.country;
          city = geoResult.city;
          region = geoResult.region;
          latitude = geoResult.latitude;
          longitude = geoResult.longitude;
        }
      } catch (geoErr) {
        console.error('Error fetching geolocation for IP:', ip, geoErr);
      }
    }

    // 3. Guardar el clic en la base de datos de manera asíncrona
    // Se ejecuta de inmediato y se capturan errores sin bloquear el redireccionamiento
    try {
      await queryMarketing(`
        INSERT INTO signature_clicks (
          signature_id, 
          element, 
          destination_url, 
          ip_address, 
          user_agent, 
          browser, 
          os, 
          device, 
          referrer, 
          country, 
          city, 
          region, 
          latitude, 
          longitude
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        sigId,
        element,
        destinationUrl,
        ip,
        userAgent,
        browser,
        os,
        device,
        referrer,
        country,
        city,
        region,
        latitude,
        longitude
      ]);
    } catch (dbErr) {
      console.error('Error writing signature click metrics to database:', dbErr);
    }

  } catch (error) {
    console.error('General error handling signature redirect:', error);
  }

  // 4. Redireccionar al destino final usando la cabecera Location directa (soporta mailto:, tel:, etc.)
  return new Response(null, {
    status: 302,
    headers: {
      'Location': destinationUrl,
    }
  });
}
