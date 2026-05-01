const ExcelJS = require('exceljs');
const db = require('../db/database');

async function generateAbstractsExcel() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TTSA Platform';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Abstracts', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Header style
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C589A' } };
  const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
  const borderStyle = { style: 'thin', color: { argb: 'FFD0D0D0' } };
  const cellBorder = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle };

  sheet.columns = [
    { header: 'ID', key: 'id', width: 6 },
    { header: 'Title', key: 'title', width: 40 },
    { header: 'Submitter', key: 'submitter', width: 22 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Nationality', key: 'nationality', width: 14 },
    { header: 'Profession', key: 'profession', width: 14 },
    { header: 'Specialty', key: 'specialty', width: 14 },
    { header: 'Seniority', key: 'seniority', width: 12 },
    { header: 'Preference', key: 'preference', width: 12 },
    { header: 'Word Count', key: 'word_count', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Reviewer', key: 'reviewer', width: 22 },
    { header: 'Originality (0-5)', key: 'c1', width: 16 },
    { header: 'Methodology (0-5)', key: 'c2', width: 18 },
    { header: 'Clarity (0-5)', key: 'c3', width: 14 },
    { header: 'Clinical Relevance (0-5)', key: 'c4', width: 22 },
    { header: 'Total Score (/20)', key: 'total', width: 16 },
    { header: 'Verdict', key: 'verdict', width: 12 },
    { header: 'Presentation Type', key: 'ptype', width: 18 },
    { header: 'Authors', key: 'authors', width: 40 },
    { header: 'Submitted At', key: 'created_at', width: 20 },
    { header: 'File Uploaded', key: 'file_uploaded', width: 14 },
  ];

  // Style header row
  sheet.getRow(1).eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.border = cellBorder;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  sheet.getRow(1).height = 30;

  // Fetch data
  const abstracts = db.prepare(`
    SELECT a.*, u.first_name || ' ' || u.last_name AS submitter_name,
           u.email AS submitter_email, u.nationality, u.profession, u.specialty, u.seniority
    FROM abstracts a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.id
  `).all();

  for (const abs of abstracts) {
    const review = db.prepare(`
      SELECT r.*, rv.first_name || ' ' || rv.last_name AS reviewer_name
      FROM reviews r
      JOIN reviewers rv ON r.reviewer_id = rv.id
      WHERE r.abstract_id = ?
    `).get(abs.id);

    const authors = db.prepare(`
      SELECT first_name || ' ' || last_name AS name, institution, country, affiliation_index
      FROM authors WHERE abstract_id = ? ORDER BY sort_order
    `).all(abs.id);

    const authorStr = authors.map(a =>
      `${a.name}${a.affiliation_index ? '⁺' + a.affiliation_index : ''} (${a.institution}, ${a.country})`
    ).join('; ');

    const row = sheet.addRow({
      id: abs.id,
      title: abs.title,
      submitter: abs.submitter_name,
      email: abs.submitter_email,
      nationality: abs.nationality,
      profession: abs.profession,
      specialty: abs.specialty,
      seniority: abs.seniority,
      preference: abs.preference,
      word_count: abs.word_count,
      status: abs.status,
      reviewer: review ? review.reviewer_name : '—',
      c1: review ? review.criteria1 : '—',
      c2: review ? review.criteria2 : '—',
      c3: review ? review.criteria3 : '—',
      c4: review ? review.criteria4 : '—',
      total: review ? review.total_score : '—',
      verdict: review ? review.verdict : '—',
      ptype: review ? review.presentation_type : '—',
      authors: authorStr,
      created_at: new Date(abs.created_at * 1000).toLocaleString('en-GB'),
      file_uploaded: abs.file_path ? 'Yes' : 'No',
    });

    // Color-code verdict
    if (review) {
      const verdictCell = row.getCell('verdict');
      if (review.verdict === 'Admitted') {
        verdictCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdcfce7' } };
        verdictCell.font = { color: { argb: 'FF166534' }, bold: true };
      } else if (review.verdict === 'Refused') {
        verdictCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFfee2e2' } };
        verdictCell.font = { color: { argb: 'FFB82538' }, bold: true };
      }
    }

    row.eachCell(cell => {
      cell.border = cellBorder;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  }

  // Add summary sheet
  const summary = workbook.addWorksheet('Summary');
  const total = abstracts.length;
  const admitted = abstracts.filter(a => a.status === 'Accepted').length;
  const refused = abstracts.filter(a => a.status === 'Refused').length;
  summary.addRow(['Metric', 'Value']);
  summary.addRow(['Total Abstracts', total]);
  summary.addRow(['Accepted', admitted]);
  summary.addRow(['Refused', refused]);
  summary.addRow(['Pending Review', total - admitted - refused]);
  summary.getRow(1).font = { bold: true };

  return workbook;
}

module.exports = { generateAbstractsExcel };
