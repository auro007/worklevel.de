const { jsPDF } = require('jspdf');
const fs = require('node:fs');
const path = require('node:path');
const rows = [['Name', 'Artikelnummer', 'Einheit', 'Einkaufspreis', 'Verkaufspreis', 'Händler'], ['Testrohr', 'TEST-IMPORT-001', 'm', '2,50', '4,00', 'Testlieferant']];
fs.writeFileSync(path.join(__dirname, 'material-fixture.csv'), rows.map(r => r.join(';')).join('\n'));
const pdf = new jsPDF({ orientation: 'landscape' });
rows.forEach((row, i) => row.forEach((cell, j) => pdf.text(cell, 10 + j * 45, 20 + i * 12)));
fs.writeFileSync(path.join(__dirname, 'material-fixture.pdf'), Buffer.from(pdf.output('arraybuffer')));
