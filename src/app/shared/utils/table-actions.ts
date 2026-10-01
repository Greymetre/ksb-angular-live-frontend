/// A table as the three screens' copy, PDF and print buttons see it: the headings and the
/// rows that are on screen. Nothing here goes to the server, so what is produced is exactly
/// what the user is looking at, page size and search included.
export interface TableSnapshot {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

/// Tab separated text, which is what a spreadsheet expects from the clipboard.
export async function copyTable(table: TableSnapshot): Promise<void> {
  const text = [table.headers, ...table.rows].map(row => row.join('\t')).join('\n');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Older browsers, and any page served without https, have no clipboard API.
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

/// jsPDF is pulled in only when a PDF is actually asked for - it is a third of a megabyte
/// and would otherwise sit in the initial bundle for every page of the CRM.
export async function downloadTablePdf(table: TableSnapshot): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const landscape = table.headers.length > 6;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.setTextColor('#153f74');
  doc.text(table.title, 40, 36);
  doc.setFontSize(9);
  doc.setTextColor('#6b7280');
  doc.text(new Date().toLocaleString(), 40, 52);
  autoTable(doc, {
    head: [table.headers],
    body: table.rows.map(row => row.map(cell => String(cell ?? ''))),
    startY: 66,
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [21, 63, 116], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    margin: { left: 40, right: 40 },
  });
  doc.save(`${fileName(table.title)}.pdf`);
}

export function printTable(table: TableSnapshot): void {
  const head = table.headers.map(x => `<th>${escapeHtml(x)}</th>`).join('');
  const body = table.rows.length
    ? table.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(String(cell ?? ''))}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${table.headers.length}" class="empty">No records found.</td></tr>`;

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const target = frame.contentWindow;
  if (!target) {
    document.body.removeChild(frame);
    return;
  }
  target.document.open();
  target.document.write(`<!doctype html><html><head><title>${escapeHtml(table.title)}</title><style>
    body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#1f2937}
    h1{font-size:18px;color:#153f74;margin:0 0 4px}
    p.meta{font-size:11px;color:#6b7280;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #dbe3ef;padding:6px 8px;text-align:left}
    th{background:#153f74;color:#fff}
    tbody tr:nth-child(even){background:#f5f8fc}
    td.empty{text-align:center;color:#6b7280}
    @page{margin:12mm}
  </style></head><body><h1>${escapeHtml(table.title)}</h1><p class="meta">${escapeHtml(new Date().toLocaleString())}</p>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`);
  target.document.close();
  target.focus();
  target.print();
  // The dialog is modal in every browser we support, so by the time print() returns the
  // frame has done its job; a short wait keeps Safari from cancelling the job.
  setTimeout(() => document.body.removeChild(frame), 1000);
}

export function fileName(title: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');
  return `${title.replace(/[^a-z0-9]+/gi, '_')}_${stamp}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
