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

      /* Hack para Gmail App en iOS/Android - Mezcla de colores para prevenir inversión de textos y fondos */
      u + .body .gmail-blend-screen {
        background: #000000 !important;
        background: linear-gradient(#000000, #000000) !important;
        mix-blend-mode: screen !important;
        display: block !important;
        min-width: 100% !important;
      }
      u + .body .gmail-blend-difference {
        background: #000000 !important;
        background: linear-gradient(#000000, #000000) !important;
        mix-blend-mode: difference !important;
        display: block !important;
        min-width: 100% !important;
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

        /* Selectores específicos para sobreescribir inline-styles de color de texto claro en Apple Mail */
        [style*="color:#ffffff"] { color: #ffffff !important; }
        [style*="color: #ffffff"] { color: #ffffff !important; }
        [style*="color:#fff"] { color: #ffffff !important; }
        [style*="color: #fff"] { color: #ffffff !important; }
        [style*="color:#FFF"] { color: #ffffff !important; }
        [style*="color: #FFF"] { color: #ffffff !important; }
        [style*="color:rgb(255,255,255)"] { color: #ffffff !important; }
        [style*="color:rgb(255, 255, 255)"] { color: #ffffff !important; }
        [style*="color: rgb(255, 255, 255)"] { color: #ffffff !important; }
        [style*="color: rgb(255,255,255)"] { color: #ffffff !important; }
        
        /* Colores crema/plomizos/amarillos de la marca Alimin */
        [style*="color:#f7b500"] { color: #f7b500 !important; }
        [style*="color: #f7b500"] { color: #f7b500 !important; }
        [style*="color:#ffcc00"] { color: #ffcc00 !important; }
        [style*="color: #ffcc00"] { color: #ffcc00 !important; }
        [style*="color:#cccccc"] { color: #cccccc !important; }
        [style*="color: #cccccc"] { color: #cccccc !important; }
        [style*="color:#eeeeee"] { color: #eeeeee !important; }
        [style*="color: #eeeeee"] { color: #eeeeee !important; }
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

  // 2. Asegurar que la etiqueta body tenga la clase "body" para que funcione el selector de Gmail
  const bodyRegex = /<body([^>]*)>/i;
  processedHtml = processedHtml.replace(bodyRegex, (match, attrs) => {
    if (attrs.includes('class=')) {
      const classRegex = /class=["']([^"']*)["']/i;
      return match.replace(classRegex, (clsMatch, clsVal) => {
        if (clsVal.split(' ').includes('body')) {
          return clsMatch;
        }
        return `class="${clsVal} body"`;
      });
    } else {
      return `<body${attrs} class="body">`;
    }
  });

  // 3. Envolver todo el contenido de <body> en las clases de mezcla para Gmail
  const bodyContentRegex = /<body([^>]*)>([\s\S]*)<\/body>/i;
  processedHtml = processedHtml.replace(bodyContentRegex, (match, bodyAttrs, bodyContent) => {
    if (bodyContent.includes('class="gmail-blend-screen"')) {
      return match; // Evita doble envoltura
    }
    return `<body${bodyAttrs}><div class="gmail-blend-screen"><div class="gmail-blend-difference">${bodyContent}</div></div></body>`;
  });

  // 4. Aplicar el Hack de Degradado de forma automática a todos los estilos en línea de fondos
  const bgStyleRegex = /background-color:\s*([^;'"\s]+)/gi;
  processedHtml = processedHtml.replace(bgStyleRegex, (match, color) => {
    return `${match}; background-image: linear-gradient(${color}, ${color})`;
  });

  return processedHtml;
}
