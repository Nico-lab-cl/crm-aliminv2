/**
 * Cápsulas de la Academia: videos cortos que explican el CRM móvil.
 *
 * Los archivos viven en la carpeta `academia/` de la raíz del proyecto (no en
 * `public/`) porque muestran datos reales de clientes: los sirve
 * `/api/academia/[archivo]` y solo a quien inició sesión. Cada cápsula tiene
 * `<slug>.mp4` (con subtítulos y música ya incluidos) y `<slug>.jpg` de portada.
 *
 * Para sumar una cápsula: copiar los dos archivos a `academia/` y agregarla aquí.
 */
export type Capsula = {
  slug: string;
  titulo: string;
  descripcion: string;
  duracion: string;
};

export type ModuloAcademia = {
  titulo: string;
  descripcion: string;
  capsulas: Capsula[];
};

export const MODULOS_ACADEMIA: ModuloAcademia[] = [
  {
    titulo: "Módulo 1 · Atender un lead",
    descripcion: "De dónde llegan tus leads, cómo leer su ficha y cómo cargar uno nuevo.",
    capsulas: [
      {
        slug: "01-mis-leads",
        titulo: "Mis Leads: filtros, perfil y notificaciones",
        descripcion:
          "La pantalla principal: filtrar por período, interés, estado y proyecto, tu perfil y la campanita de avisos.",
        duracion: "4:32",
      },
      {
        slug: "02-ficha-del-lead",
        titulo: "La ficha del lead",
        descripcion:
          "Llamar, WhatsApp y correo, registrar el contacto, cambiar de etapa, nivel de interés, reserva, visita y firma.",
        duracion: "5:03",
      },
      {
        slug: "03-nuevo-lead",
        titulo: "Crear un nuevo lead",
        descripcion: "Cómo cargar a mano un cliente con el botón + de la barra de abajo.",
        duracion: "0:52",
      },
    ],
  },
  {
    titulo: "Módulo 2 · Seguimiento y agenda",
    descripcion: "Ordenar tu cartera por etapa, agendar visitas y firmas, y ver quién está más interesado.",
    capsulas: [
      {
        slug: "04-pipeline",
        titulo: "Pipeline: tus clientes por etapa",
        descripcion: "Nuevo, Contactado, Visita, Reservado y Perdido en un tablero, con acceso directo a cada ficha.",
        duracion: "1:37",
      },
      {
        slug: "05-visitas",
        titulo: "Calendario de visitas",
        descripcion: "Las visitas que llegan desde la web y las que tú agendas, día por día.",
        duracion: "0:54",
      },
      {
        slug: "06-firmas",
        titulo: "Calendario de firmas",
        descripcion: "Registra las firmas en el CRM y el equipo de notaría queda informado sin que tengas que avisar.",
        duracion: "0:54",
      },
      {
        slug: "07-actividad",
        titulo: "Actividad: quién está más interesado",
        descripcion: "El puntaje de cada lead según lo que hace en la web, el chat y los correos, para elegir a quién llamar.",
        duracion: "2:36",
      },
    ],
  },
];

export const CAPSULAS: Capsula[] = MODULOS_ACADEMIA.flatMap((m) => m.capsulas);
