/**
 * Optimiza automáticamente el HTML de la campaña para prevenir 
 * la inversión de color agresiva en Gmail Dark Mode y Apple Mail.
 */
export function optimizeHtmlForDarkMode(html: string): string {
  if (!html) return html;

  // 1. Inyectar metatags y estilos CSS de compatibilidad en el <head>
  const metaTags = `
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }
      @media (prefers-color-scheme: dark) {
        /* Fuerza a que los clientes que respetan prefers-color-scheme mantengan el diseño */
        .dm-keep-dark {
          background-color: #060b2b !important;
          background-image: linear-gradient(#060b2b, #060b2b) !important;
        }
        .dm-keep-white-text {
          color: #ffffff !important;
        }
      }
    </style>
  `;

  let processedHtml = html;
  
  if (processedHtml.includes('</head>')) {
    processedHtml = processedHtml.replace('</head>', `${metaTags}</head>`);
  } else if (processedHtml.includes('<head>')) {
    processedHtml = processedHtml.replace('<head>', `<head>${metaTags}`);
  } else {
    processedHtml = metaTags + processedHtml;
  }

  // 2. Aplicar el Hack de Degradado de forma automática a todos los estilos en línea de fondos
  // Busca 'background-color: <color>' y le añade 'background-image: linear-gradient(<color>, <color>)'
  // Soportando valores sin punto y coma hasta el final de la cadena de estilo
  const bgStyleRegex = /background-color:\s*([^;'"\s]+)/gi;
  
  processedHtml = processedHtml.replace(bgStyleRegex, (match, color) => {
    // Si ya tiene un degradado en la misma declaración, no lo agregamos de nuevo
    return `${match}; background-image: linear-gradient(${color}, ${color})`;
  });

  return processedHtml;
}
