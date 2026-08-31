/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  experimental: {
    // Habilita src/instrumentation.ts, donde vive el temporizador que dispara
    // los recordatorios de leads sin contactar. En Next 14 sigue detras de esta
    // bandera; sin ella el archivo no se ejecuta y el cron no corre.
    instrumentationHook: true,

    // firebase-admin es una libreria de Node: usa 'tls', 'stream' y 'net'.
    // Webpack la sigue igual al compilar instrumentation.ts para el runtime
    // edge, donde esos modulos no existen, y el build falla aunque el codigo
    // nunca se ejecute ahi. Declararla externa le dice a Next que la deje como
    // un require de Node y no intente empaquetarla.
    serverComponentsExternalPackages: ['firebase-admin'],
  },
};

export default nextConfig;
