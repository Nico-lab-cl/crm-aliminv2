/**
 * Temporizador interno del CRM.
 *
 * Next.js ejecuta este archivo una vez al arrancar el servidor. Se usa para que
 * los recordatorios de leads sin contactar corran solos, sin depender de n8n ni
 * de un crontab en el VPS.
 *
 * Por que dentro del proceso y no afuera: el aviso mas corto es a los 5
 * minutos, asi que hace falta una pasada por minuto. Un agendador externo es un
 * cuarto punto de falla silencioso en un circuito de notificaciones que ya
 * tiene tres (el tipo del push, el token FCM y la asignacion del lead), y
 * ninguno avisa cuando se cae: el sintoma siempre llega por reporte de un
 * asesor, tarde. Si el CRM esta arriba, el cron esta arriba.
 *
 * Si algun dia el CRM corre replicado, esto se ejecuta en cada replica. No
 * duplica avisos igual: runLeadFollowups avanza el contador con un updateMany
 * condicionado al valor anterior, asi que solo una replica gana cada lead. Lo
 * unico que se duplica es el trabajo de leer, que es barato.
 *
 * La ruta /api/cron/lead-followups sigue existiendo para disparo manual y para
 * un agendador externo, si algun dia se prefiere ese camino.
 */

const CADA_MS = 60 * 1000;

export async function register() {
  // El import va DENTRO del if, y el if compara por igualdad en positivo.
  //
  // No es estilo: es la unica forma de que compile. Next construye este archivo
  // dos veces, una para Node y otra para el runtime edge, y reemplaza
  // process.env.NEXT_RUNTIME por una constante en cada build. Con la
  // comparacion en positivo, en el build de edge la condicion queda en false y
  // webpack borra el bloque entero, con import incluido.
  //
  // Con una guarda de salida temprana ("if (... !== 'nodejs') return") el
  // import queda fuera del if, webpack lo sigue igual, y el build falla al
  // intentar empaquetar firebase-admin para edge: esa libreria usa 'tls' y
  // 'stream', que en edge no existen.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // En desarrollo, Next recarga el modulo en cada cambio y se acumularian
    // temporizadores. La marca global sobrevive a la recarga; el proceso no.
    const global_ = globalThis as any;
    if (global_.__cronAlimin) return;
    global_.__cronAlimin = true;

    const { runLeadFollowups } = await import("./lib/followups");

    const pasada = async () => {
      try {
        const resultado = await runLeadFollowups();
        if (resultado.enviados > 0) {
          console.log(
            `[cron] Recordatorios de seguimiento: ${resultado.enviados} enviados de ${resultado.revisados} revisados.`
          );
        }
      } catch (error) {
        // Nunca se relanza: una excepcion aca mataria el temporizador y los
        // recordatorios se apagarian en silencio hasta el proximo reinicio.
        console.error("[cron] Fallo la pasada de recordatorios:", error);
      }
    };

    // La primera pasada ocurre recien al minuto, no al arrancar: asi no compite
    // con el arranque del servidor ni con una migracion que este corriendo.
    const timer = setInterval(pasada, CADA_MS);
    timer.unref?.();

    console.log("[cron] Recordatorios de leads sin contactar activos: una pasada por minuto.");
  }
}
