// Datos de prueba simulados compartidos para desarrollo local sin base de datos activa

export interface MockLead {
  id: string;
  FirstName: string;
  LastName: string;
  Email: string;
  Phone: string;
  Status: string;
  Source: string;
  Project: string;
  CreatedAt: string;
  Lote: string;
  Etapa: string;
  Rating: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const MOCK_LEADS: MockLead[] = [
  { id: '1', FirstName: 'José', LastName: 'Pérez', Email: 'jose.perez@gmail.com', Phone: '+56 9 8765 4321', Status: 'Nuevo', Source: 'META', Project: 'Lomas del Mar', CreatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), Lote: 'A-12', Etapa: 'Etapa 1', Rating: 'FRIO', notes: 'Interesado en segunda vivienda. Solicita información de financiamiento.', AdvisorName: 'Orlando Costa', formId: '798890826611593', adName: 'Lomas Campaña FB', pie: '$5.500.000 CLP' },
  { id: '2', FirstName: 'María', LastName: 'López', Email: 'maria.lopez@yahoo.com', Phone: '+56 9 7654 3210', Status: 'Contactado', Source: 'Sitio Web', Project: 'Arena y Sol', CreatedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(), Lote: 'B-04', Etapa: 'Etapa 2', Rating: 'INTERESADO', notes: 'Visitó la web desde anuncio. Llamar mañana por la tarde.', AdvisorName: 'Marcela Escobar' },
  { id: '3', FirstName: 'Carlos', LastName: 'Valenzuela', Email: 'carlos.v@outlook.com', Phone: '+56 9 6543 2109', Status: 'Visita', Source: 'Referido', Project: 'Lomas del Mar', CreatedAt: new Date(Date.now() - 1000 * 60 * 300).toISOString(), Lote: 'C-22', Etapa: 'Etapa 1', Rating: 'VENTA', notes: 'Reserva agendada para el sábado. Lote pre-seleccionado.', AdvisorName: 'Barbara Arias' },
  { id: '4', FirstName: 'Francisca', LastName: 'Silva', Email: 'fran.silva@gmail.com', Phone: '+56 9 5432 1098', Status: 'Nuevo', Source: 'META', Project: 'Arena y Sol', CreatedAt: new Date(Date.now() - 1000 * 60 * 1440).toISOString(), Lote: 'A-02', Etapa: 'Etapa 3', Rating: 'FRIO', notes: '', AdvisorName: 'Marcela Escobar', formId: '1896385304349584', adName: 'Arena Sol Instagram Ads', pie: '$8.000.000 CLP' },
  { id: '5', FirstName: 'Andrés', LastName: 'Muñoz', Email: 'andres.munoz@alimin.cl', Phone: '+56 9 4321 0987', Status: 'Contactado', Source: 'META', Project: 'Lomas del Mar', CreatedAt: new Date(Date.now() - 1000 * 60 * 2880).toISOString(), Lote: 'D-15', Etapa: 'Etapa 2', Rating: 'INTERESADO', notes: 'Quiere coordinar una videollamada para revisar planos.', AdvisorName: 'Orlando Costa', formId: '798890826611593', adName: 'Lomas Campaña FB', pie: 'No especifica' }
];
