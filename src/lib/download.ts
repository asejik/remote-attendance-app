import { EVENT_HEADER, SUMMARY_HEADER, toCsv } from './reports';

type Cell = string | number | boolean | null;

const save = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadCsv = (filename: string, header: string[], rows: Cell[][]) =>
  save(new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' }), filename);

// One workbook with two sheets. SheetJS is loaded only when needed. Strings are
// written as text cells (never formulas), so no formula escaping is needed here.
export const downloadXlsx = async (filename: string, events: Cell[][], summary: Cell[][]) => {
  const XLSX = await import('xlsx');
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([EVENT_HEADER, ...events]), 'Clock-ins');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([SUMMARY_HEADER, ...summary]), 'Summary');
  const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  save(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
};
