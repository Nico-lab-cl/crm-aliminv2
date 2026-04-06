# 📊 Bitácora de Despliegues y Actividades (30 Mar - 5 Abr 2026)

Este documento detalla todas las actividades de desarrollo, correcciones en base de datos, despliegues y optimizaciones de infraestructura realizadas durante la semana del lunes 30 de marzo al domingo 5 de abril de 2026.

---

## 🎯 Resumen Ejecutivo Semanal

Durante esta semana, el enfoque del equipo de desarrollo estuvo dictado por tres aristas principales:
1. **App Móvil de Postventa y Datos:** Reformulación de las capacidades de la app móvil para administración de perfiles, junto a mitigaciones profundas de datos financieros legacy y estandarización del login (case sensitivity).
2. **CRM Lomas del Mar:** Completar el seguimiento de reservas, orígenes de prospectos y habilitación de los filtros necesarios para las campañas activas.
3. **Distribución Inteligente de Contactos (Leads):** Fuerte modificación sobre el comportamiento automático de asignación de prospectos para evitar sanciones por envíos en WhatsApp, distribución horaria y manejos específicos para ejecutivos puntuales (Marcela).

> [!TIP]
> **Impacto Principal:** La introducción del sistema basado en *Time-Windows* logran una mitigación esencial contra la saturación de asesores y mejoran drásticamente la tasa de bloqueo de WhatsApp.

---

## 📅 Desglose Diario de Actividades

### Lunes, 30 de Marzo de 2026

* **Refactorización Administrativa App Postventa Móvil:** Se inició una transformación integral para convertir la app en una herramienta de auditoría para gerencia y control interno.
  * *Implementaciones:* Módulo de Gestión de Cuentas, reseteo de contraseñas de cliente directamente desde la interfaz móvil e implementación de un visor interno de documentos (PDFs, recibos) para eliminar la dependencia del navegador del teléfono.
* **Sanitización de Correos Electrónicos Base de Datos:** Se creó una estrategia de validación *case-insensitive* transversal para todo el backend.
  * *Implementaciones:* Migraciones a base de datos para homologar a minúsculas todos los correos electrónicos dentro de las tablas `User`, `Reservation` y `Contact`, previniendo errores de login y recuperación de cuentas.
* **Diagnóstico de Base de Datos - Discrepancias Financieras Postventa:** Inicio de una auditoría para resolver inconsistencias en cobros de clientes legacy.
* **CRM: Lomas del Mar:** Comienzo de la integración de reservas y creación de filtros precisos por estado de pagos y orígenes del lead (Meta, TikTok, base CSV para control de ROI).
  * *Acción Rápida:* Se pausó de urgencia toda asignación automatizada de leads en el CRM de forma preventiva para asentar los nuevos orígenes.

### Martes, 31 de Marzo de 2026

* **Mantenimiento y Continuidad Cargas Lomas del Mar:** Seguimiento profundo sobre los avances y la integración del panel de administración del CRM. Se mantuvieron las auditorías abiertas y los arreglos preventivos en filtros por estado de los clientes en `Reservation`. 

### Miércoles, 1 de Abril de 2026

* **Solución de Datos Financieros Postventa (Despliegue de Corrección):** Se finalizó con éxito el arreglo iniciado el lunes.
  * *Detalle Técnico:* Se auditó a fondo las columnas asociadas a `Reservation` y `PaymentReceipt`. Se estabilizó de nuevo el dashboard de cuotas de Postventa asegurando que los cálculos (cantidad de cuotas pagadas de manera íntegra y cronograma de próxima fecha de pago) sean matemáticamente correctos y sincronizados entre web y móvil (e.g. caso resuelto para clientes legacy como "Luis Varela").

### Jueves, 2 de Abril de 2026

* **Consolidación de Proyecto Lomas Del Mar:** Día enteramente destinado a una revisión documentada y evaluación general sobre las distintas mejoras a la infraestructura conseguida. Se revisó de manera global el impacto de los cambios arquitectónicos en la app de postventa y se dejó registro del hito.

### Viernes, 3 de Abril de 2026

* **Cierre y Ajustes Finales - Gestión de CRM:** Se completaron las modificaciones restantes sobre los filtros orientados a asesores y atribución de procedencia permitiendo retomar el ritmo de las campañas operativas sin incidentes de origen de base de datos.
  
### Sábado, 4 de Abril de 2026

> [!WARNING]
> La recepción de tráfico de Leads durante altas horas de la noche estaba generando conflictos de atención y un desgaste severo en los vendedores, adicionalmente conllevaba el riesgo sistémico de reportes de WhatsApp.

* **Implementación de Asignaciones Limitadas por Hora (Time-Window):**
  * *Implementaciones:* Se reconfiguró el cerebro del CRM para limitar los envíos programados de asesores **solo a la ventana de 09:00 AM a 12:00 AM (Chile)**.
  * *Solución de Escalabilidad:* Se desarrolló y conectó una lógica de fondo (*Background Backlog*) para represar a los interesados nocturnos y distribuirlos paulatinamente durante el día con un goteo para evitar sobrecargas y asegurar un flujo continuo.
* **Deshabilitación Temporal – Asesora Marcela:** Se tuvo que intervenir la lógica de asignación para crear un *Flag/Condicional temporal* introducido directamente en la base de datos que la dejó suspendida de la ronda de contactos automatizados por 24 horas exactas.

### Domingo, 5 de Abril de 2026

> [!IMPORTANT]
> **Correcciones Críticas en Registros de Cierre (Día de atención inmediata técnica)**

* **Baja Definitiva del Pool de Contactos - Asesora Marcela:** Se realizó un ajuste técnico subsiguiente sobre los cambios del sábado para detener por completo y ya no solo temporalmente la recepción de *Leads* para la perfil y entidad de base de datos de esta ejecutiva.
* **Hotfix: Error de Registro de Firmas de Asesores:**
  * *Diagnóstico:* Los vendedores estaban perdiendo la habilidad de guardar contratos o confirmar recibos debido a una falla que les impedía registrar su firma en  `src/app/dashboard/leads/[id]/signing/page.tsx`.
  * *Resolución:* Un examen al esquema de PRISMA/Base de datos reveló inconvenientes estructurales y configuraciones faltantes, ejecutando comandos SQL manuales para reactivar inmediatamente el sistema y desplegando el parche a producción para solventar la fricción comercial de final de semana.

---
*Reporte generado por el Asistente de Desarrollo AI basándose en los registros transaccionales de código y tareas solicitadas.*
