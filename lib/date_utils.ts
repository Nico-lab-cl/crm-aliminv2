/**
 * Parsea una fecha de forma robusta soportando múltiples formatos
 * como DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD e ISO.
 */
export function parseDateRobust(dateVal: unknown): Date | null {
  if (dateVal === null || dateVal === undefined) return null;
  
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? null : dateVal;
  }
  
  if (typeof dateVal !== 'string') {
    const parsed = new Date(dateVal as number | string);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  const cleaned = dateVal.trim();
  if (!cleaned) return null;

  // Formato: DD-MM-YYYY o DD/MM/YYYY (común en Chile/España)
  const dmYRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/;
  const match = cleaned.match(dmYRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (!isNaN(date.getTime())) return date;
  }

  // Formato: YYYY-MM-DD o YYYY/MM/DD
  const yMdRegex = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
  const matchY = cleaned.match(yMdRegex);
  if (matchY) {
    const year = parseInt(matchY[1], 10);
    const month = parseInt(matchY[2], 10) - 1;
    const day = parseInt(matchY[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (!isNaN(date.getTime())) return date;
  }

  // Fallback a parseo nativo
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}
