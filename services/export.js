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
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Submission #', key: 'submission_number', width: 16 },
    { header: 'Title', key: 'title', width: 35 },
    { header: 'Topic', key: 'topic', width: 22 },
    { header: 'Abstract Core (Main Text)', key: 'main_text', width: 65 },
    { header: 'Word Count', key: 'word_count', width: 12 },
    { header: 'Preference', key: 'preference', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Submitter Name', key: 'submitter', width: 22 },
    { header: 'Submitter Email', key: 'email', width: 28 },
    { header: 'Submitter Country', key: 'country', width: 16 },
    { header: 'Nationality', key: 'nationality', width: 14 },
    { header: 'Profession', key: 'profession', width: 14 },
    { header: 'Specialty', key: 'specialty', width: 14 },
    { header: 'Specialty Details', key: 'specialty_details', width: 20 },
    { header: 'Seniority', key: 'seniority', width: 12 },
    { header: 'Authors & Affiliations', key: 'authors', width: 50 },
    { header: 'Reviewer Name', key: 'reviewer', width: 22 },
    { header: 'Relevance', key: 'c1', width: 14 },
    { header: 'Methodology', key: 'c2', width: 16 },
    { header: 'Clarity', key: 'c3', width: 14 },
    { header: 'Practical Impact', key: 'c4', width: 18 },
    { header: 'Total Score (/20)', key: 'total', width: 16 },
    { header: 'Verdict', key: 'verdict', width: 14 },
    { header: 'Presentation Type', key: 'ptype', width: 22 },
    { header: 'Reviewer Comments', key: 'comments', width: 35 },
    { header: 'Uploaded File Name', key: 'file_name', width: 25 },
    { header: 'File Uploaded', key: 'file_uploaded', width: 14 },
    { header: 'File Upload Date', key: 'file_uploaded_at', width: 20 },
    { header: 'Created Date', key: 'created_at', width: 20 },
    { header: 'Updated Date', key: 'updated_at', width: 20 },
  ];

  // Style header row
  sheet.getRow(1).eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.border = cellBorder;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  sheet.getRow(1).height = 30;

  // Fetch all abstracts with full submitter details
  const abstracts = db.prepare(`
    SELECT a.*,
           u.first_name || ' ' || u.last_name AS submitter_name,
           u.email AS submitter_email,
           u.country AS submitter_country,
           u.nationality,
           u.profession,
           u.specialty,
           u.specialty_details,
           u.seniority
    FROM abstracts a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.id
  `).all();

  for (const abs of abstracts) {
    // Fetch review details
    const review = db.prepare(`
      SELECT r.*, rv.first_name || ' ' || rv.last_name AS reviewer_name
      FROM reviews r
      JOIN reviewers rv ON r.reviewer_id = rv.id
      WHERE r.abstract_id = ?
    `).get(abs.id);

    // Fetch authors list
    const authors = db.prepare(`
      SELECT first_name, last_name, email, institution, country, affiliation_index, is_corresponding
      FROM authors WHERE abstract_id = ? ORDER BY sort_order
    `).all(abs.id);

    const authorStr = authors.map(a => {
      let str = `${a.first_name} ${a.last_name}`;
      if (a.is_corresponding) str += ' (Corresponding)';
      if (a.affiliation_index) str += `⁺${a.affiliation_index}`;
      str += ` (${a.institution}, ${a.country})`;
      if (a.email) str += ` <${a.email}>`;
      return str;
    }).join('; ');

    const formattedSubmissionNum = abs.submission_number 
      ? `ABS-${String(abs.submission_number).padStart(3, '0')}`
      : `ABS-${String(abs.id).padStart(3, '0')}`;

    const row = sheet.addRow({
      id: abs.id,
      submission_number: formattedSubmissionNum,
      title: abs.title || '—',
      topic: abs.topic || '—',
      main_text: abs.main_text || '—',
      word_count: abs.word_count || 0,
      preference: abs.preference || '—',
      status: abs.status || '—',
      submitter: abs.submitter_name || '—',
      email: abs.submitter_email || '—',
      country: abs.submitter_country || '—',
      nationality: abs.nationality || '—',
      profession: abs.profession || '—',
      specialty: abs.specialty || '—',
      specialty_details: abs.specialty_details || '—',
      seniority: abs.seniority || '—',
      authors: authorStr || '—',
      reviewer: review ? review.reviewer_name : '—',
      c1: review ? review.criteria1 : '—',
      c2: review ? review.criteria2 : '—',
      c3: review ? review.criteria3 : '—',
      c4: review ? review.criteria4 : '—',
      total: review ? review.total_score : '—',
      verdict: review ? review.verdict : '—',
      ptype: review ? review.presentation_type : '—',
      comments: review ? (review.comments || '—') : '—',
      file_name: abs.file_name || '—',
      file_uploaded: abs.file_path ? 'Yes' : 'No',
      file_uploaded_at: abs.file_uploaded_at ? new Date(abs.file_uploaded_at * 1000).toLocaleString('en-GB') : '—',
      created_at: abs.created_at ? new Date(abs.created_at * 1000).toLocaleString('en-GB') : '—',
      updated_at: abs.updated_at ? new Date(abs.updated_at * 1000).toLocaleString('en-GB') : '—',
    });

    // Color-code verdict
    if (review && review.verdict) {
      const verdictCell = row.getCell('verdict');
      if (review.verdict === 'Admitted') {
        verdictCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        verdictCell.font = { color: { argb: 'FF166534' }, bold: true };
      } else if (review.verdict === 'Refused') {
        verdictCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
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
