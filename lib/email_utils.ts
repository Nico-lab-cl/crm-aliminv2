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

      /* --- CAPA DE SEGURIDAD GMAIL (FUERA DE MEDIA QUERIES) --- */
      /* Fuerza texto blanco por defecto para elementos de texto en Gmail */
      u + .body td, 
      u + .body p, 
      u + .body span, 
      u + .body a, 
      u + .body div, 
      u + .body h1, 
      u + .body h2, 
      u + .body h3, 
      u + .body h4,
      u + .body strong,
      u + .body em,
      u + .body font {
        color: #ffffff !important;
      }

      /* Preservar colores específicos del diseño (como los amarillos/dorados y azul de Alimin) */
      u + .body [style*="color:#f7b500"] { color: #f7b500 !important; }
      u + .body [style*="color: #f7b500"] { color: #f7b500 !important; }
      u + .body [style*="color:#ffcc00"] { color: #ffcc00 !important; }
      u + .body [style*="color: #ffcc00"] { color: #ffcc00 !important; }
      u + .body [style*="color:#2bbaef"] { color: #2bbaef !important; }
      u + .body [style*="color: #2bbaef"] { color: #2bbaef !important; }
      u + .body [style*="color:#cccccc"] { color: #cccccc !important; }
      u + .body [style*="color: #cccccc"] { color: #cccccc !important; }
      u + .body [style*="color:#eeeeee"] { color: #eeeeee !important; }
      u + .body [style*="color: #eeeeee"] { color: #eeeeee !important; }

      /* Preservar fondos específicos (como el azul del botón y el fondo marino) */
      u + .body [style*="background-color:#060b2b"] {
        background-color: #060b2b !important;
        background-image: linear-gradient(#060b2b, #060b2b) !important;
      }
      u + .body [style*="background-color: #060b2b"] {
        background-color: #060b2b !important;
        background-image: linear-gradient(#060b2b, #060b2b) !important;
      }
      u + .body [style*="background-color:#2bbaef"] {
        background-color: #2bbaef !important;
        background-image: linear-gradient(#2bbaef, #2bbaef) !important;
      }
      u + .body [style*="background-color: #2bbaef"] {
        background-color: #2bbaef !important;
        background-image: linear-gradient(#2bbaef, #2bbaef) !important;
      }

      /* --- COMPATIBILIDAD CON APPLE MAIL (DENTRO DE MEDIA QUERIES) --- */
      @media (prefers-color-scheme: dark) {
        .dm-keep-dark {
          background-color: #060b2b !important;
          background-image: linear-gradient(#060b2b, #060b2b) !important;
        }
        .dm-keep-white-text {
          color: #ffffff !important;
        }

        /* Fuerza colores originales en Apple Mail */
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

  // 4. Encontrar estilos inline de color y añadirles text-shadow y data-ogsc (Capa 2 de seguridad)
  // Esto asegura que incluso si Gmail ignora el blend mode, el color del texto permanezca legible
  const colorRegex = /<([a-zA-Z0-9]+)\b([^>]*style=["']([^"']*color:\s*([^;'"\s>]+)[^"']*)["'][^>]*)>/gi;
  processedHtml = processedHtml.replace(colorRegex, (match, tagName, tagAttrs, styleContent, colorVal) => {
    if (tagAttrs.includes('data-ogsc=')) {
      return match;
    }

    const cleanColor = colorVal.trim().replace(/['"]/g, '');
    
    // Solo aplicar a colores claros (blanco, amarillos, grises claros)
    const isLightColor = /#(ffffff|fff|fefefe|fffffe|cccccc|eeeeee|e0e0e0|f7b500|ffcc00|ffff00|ffcc33)/i.test(cleanColor) || 
                         /rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/i.test(cleanColor);
                         
    if (!isLightColor) {
      return match;
    }

    // Añadir text-shadow al estilo inline actual
    const styleTrimmed = styleContent.trim().replace(/;+$/, '');
    const updatedStyle = styleContent.includes('text-shadow') 
      ? styleContent 
      : `${styleTrimmed}; text-shadow: 0px 0px 1px ${cleanColor};`;

    // Reconstruir atributos del tag
    const updatedAttrs = tagAttrs.replace(styleContent, updatedStyle);
    return `<${tagName}${updatedAttrs} data-ogsc="color: ${cleanColor} !important;">`;
  });

  // 5. Encontrar estilos inline de background-color y añadirles data-ogsb y degradados
  const bgRegex = /<([a-zA-Z0-9]+)\b([^>]*style=["']([^"']*background-color:\s*([^;'"\s>]+)[^"']*)["'][^>]*)>/gi;
  processedHtml = processedHtml.replace(bgRegex, (match, tagName, tagAttrs, styleContent, colorVal) => {
    if (tagAttrs.includes('data-ogsb=')) {
      return match;
    }

    const cleanColor = colorVal.trim().replace(/['"]/g, '');
    const styleTrimmed = styleContent.trim().replace(/;+$/, '');
    const updatedStyle = styleContent.includes('background-image')
      ? styleContent
      : `${styleTrimmed}; background-image: linear-gradient(${cleanColor}, ${cleanColor});`;
      
    const updatedAttrs = tagAttrs.replace(styleContent, updatedStyle);
    return `<${tagName}${updatedAttrs} data-ogsb="background-color: ${cleanColor} !important;">`;
  });

  return processedHtml;
}
