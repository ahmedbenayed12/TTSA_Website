const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = process.env.EMAIL_FROM || '"TTSA" <noreply@ttsa.tn>';

async function sendOTP(toEmail, firstName, otp) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: 'TTSA – Verify Your Email Address',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#0C589A;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
          <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
        </div>
        <div style="padding:32px">
          <p style="font-size:16px">Dear <strong>${firstName}</strong>,</p>
          <p>Thank you for registering with TTSA. Please use the following code to verify your email address:</p>
          <div style="text-align:center;margin:32px 0">
            <span style="display:inline-block;background:#B82538;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;padding:16px 32px;border-radius:8px">${otp}</span>
          </div>
          <p style="color:#666;font-size:13px">This code expires in <strong>15 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#aaa;font-size:12px;text-align:center">Tunisian Thoracic Surgery Association &copy; 2026</p>
        </div>
      </div>
    `,
  });
}

async function sendPasswordResetOTP(toEmail, firstName, otp) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: 'TTSA – Password Reset Request',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#0C589A;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
          <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
        </div>
        <div style="padding:32px">
          <p style="font-size:16px">Dear <strong>${firstName}</strong>,</p>
          <p>We received a request to reset your password for the TTSA platform. Please use the following code to reset your password:</p>
          <div style="text-align:center;margin:32px 0">
            <span style="display:inline-block;background:#B82538;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;padding:16px 32px;border-radius:8px">${otp}</span>
          </div>
          <p style="color:#666;font-size:13px">This code expires in <strong>15 minutes</strong>. If you did not request a password reset, please ignore this email.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#aaa;font-size:12px;text-align:center">Tunisian Thoracic Surgery Association &copy; 2026</p>
        </div>
      </div>
    `,
  });
}

async function sendAbstractConfirmation(toEmail, firstName, abstractTitle) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: 'TTSA – Abstract Submission Confirmed',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#0C589A;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
          <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
        </div>
        <div style="padding:32px">
          <p>Dear <strong>${firstName}</strong>,</p>
          <p>Your abstract has been successfully submitted and is now <strong>locked for review</strong>.</p>
          <div style="background:#f0f7ff;border-left:4px solid #0C589A;padding:16px;border-radius:4px;margin:16px 0">
            <strong>Abstract:</strong> ${abstractTitle}
          </div>
          <p>You will be notified once the review process is complete.</p>
          <p style="color:#aaa;font-size:12px;text-align:center;margin-top:32px">Tunisian Thoracic Surgery Association &copy; 2026</p>
        </div>
      </div>
    `,
  });
}

async function sendVerdict(toEmail, firstName, abstractTitle, verdict, presentationType) {
  const transporter = createTransporter();
  const isAccepted = verdict === 'Admitted';
  const color = isAccepted ? '#166534' : '#B82538';
  const bg = isAccepted ? '#dcfce7' : '#fee2e2';
  const label = isAccepted ? '✅ ACCEPTED' : '❌ REFUSED';

  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: `TTSA – Abstract Review Result: ${isAccepted ? 'Accepted' : 'Refused'}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#0C589A;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
          <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
        </div>
        <div style="padding:32px">
          <p>Dear <strong>${firstName}</strong>,</p>
          <p>The scientific committee has reviewed your abstract submission:</p>
          <div style="background:#f0f7ff;border-left:4px solid #0C589A;padding:16px;border-radius:4px;margin:16px 0">
            <strong>Abstract:</strong> ${abstractTitle}
          </div>
          <div style="text-align:center;margin:24px 0">
            <span style="display:inline-block;background:${bg};color:${color};font-size:20px;font-weight:700;padding:12px 32px;border-radius:8px;border:2px solid ${color}">${label}</span>
          </div>
          ${isAccepted ? `<p>Presentation type: <strong>${presentationType}</strong></p>
          <p>Please log in to your participant portal to upload your final presentation file before the upload deadline.</p>` : '<p>Thank you for your submission. We encourage you to participate in future congresses.</p>'}
          <p style="color:#aaa;font-size:12px;text-align:center;margin-top:32px">Tunisian Thoracic Surgery Association &copy; 2026</p>
        </div>
      </div>
    `,
  });
}

function formatEmailDeadline(val) {
  if (!val) return 'soon';
  let d = null;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    d = new Date(val < 1e11 ? val * 1000 : val);
  } else if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed, 10);
      d = new Date(num < 1e11 ? num * 1000 : num);
    } else {
      d = new Date(trimmed);
    }
  }
  if (!d || isNaN(d.getTime())) return 'soon';

  const datePart = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} at ${hours}:${minutes}`;
}

async function sendFileUploadReminder(toEmail, firstName, abstractTitle, uploadDeadline) {
  const transporter = createTransporter();
  const deadlineStr = formatEmailDeadline(uploadDeadline);
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: 'TTSA – Final Reminder: Please Upload Your Presentation File',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;background:#ffffff">
        <div style="background:#0C589A;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
          <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
        </div>
        <div style="padding:28px 32px">
          <p style="font-size:15px;margin-top:0">Dear <strong>${firstName}</strong>,</p>
          <p style="font-size:14px;color:#334155;line-height:1.5">
            This is a friendly reminder that your abstract has been <strong style="color:#166534">accepted</strong> by the scientific committee, but we have not yet received your final presentation file.
          </p>

          <div style="background:#f0f7ff;border-left:4px solid #0C589A;padding:14px 16px;border-radius:4px;margin:16px 0;font-size:14px">
            <strong>Abstract:</strong> ${abstractTitle}
          </div>

          <div style="background:#fff7ed;border-left:4px solid #f97316;padding:14px 16px;border-radius:4px;margin:16px 0;font-size:14px">
            ⏰ <strong>Upload deadline (24h):</strong> <span style="color:#c2410c;font-weight:700">${deadlineStr}</span>
          </div>

          <div style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #B82538;border-radius:6px;padding:16px;margin:20px 0;font-size:13px;line-height:1.6;color:#1e293b">
            <strong style="color:#B82538;font-size:14px;display:block;margin-bottom:10px">⚠️ Important Guidelines:</strong>
            <ul style="margin:0;padding-left:18px">
              <li style="margin-bottom:8px">
                <strong>Final Deadline Extension:</strong> This is the <u>final extension</u> of the upload deadline. No further extensions will be granted.
              </li>
              <li style="margin-bottom:8px">
                <strong>No On-Site File Submissions:</strong> For organizational and technical reasons, <u>no presentation files will be accepted on-site on the day of the congress</u>.
              </li>
              <li style="margin-bottom:8px">
                <strong>Upload Exclusively via the Platform:</strong> Your presentation file must be uploaded <u>exclusively through the online portal</u> in order to guarantee the issuance and delivery of your <strong>presentation certificate</strong>.
              </li>
              <li>
                <strong>Technical Support:</strong> In case of any technical difficulty during upload, please contact support directly via WhatsApp:<br/>
                <a href="https://wa.me/21623935354" style="display:inline-block;margin-top:6px;color:#166534;font-weight:700;text-decoration:none;background:#dcfce7;padding:5px 12px;border-radius:4px;border:1px solid #86efac;font-size:13px">
                  📱 WhatsApp: +216 23 935 354
                </a>
              </li>
            </ul>
          </div>

          <p style="font-size:14px;color:#334155">Please log in to your participant portal and upload your presentation file (PowerPoint or PDF) before the deadline.</p>

          <div style="text-align:center;margin:24px 0">
            <a href="${process.env.APP_URL || 'http://localhost:3000'}/member/dashboard.html" style="display:inline-block;background:#0C589A;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">Go to My Portal →</a>
          </div>

          <p style="color:#aaa;font-size:12px;text-align:center;margin-top:32px">Tunisian Thoracic Surgery Association &copy; 2026</p>
        </div>
      </div>
    `,
  });
}

async function sendReviewerLoginOTP(toEmail, firstName, otp) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: 'TTSA – Reviewer Login Verification Code',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#0C589A;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
          <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
        </div>
        <div style="padding:32px">
          <p style="font-size:16px">Dear <strong>${firstName}</strong>,</p>
          <p>Please use the following verification code to complete your reviewer login:</p>
          <div style="text-align:center;margin:32px 0">
            <span style="display:inline-block;background:#B82538;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;padding:16px 32px;border-radius:8px">${otp}</span>
          </div>
          <p style="color:#666;font-size:13px">This code expires in <strong>15 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#aaa;font-size:12px;text-align:center">Tunisian Thoracic Surgery Association &copy; 2026</p>
        </div>
      </div>
    `,
  });
}

async function sendAdminLoginOTP(toEmail, firstName, otp) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: 'TTSA – Admin Login Verification Code',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#0C589A;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
          <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
        </div>
        <div style="padding:32px">
          <p style="font-size:16px">Dear <strong>${firstName}</strong>,</p>
          <p>Please use the following verification code to complete your administrator login:</p>
          <div style="text-align:center;margin:32px 0">
            <span style="display:inline-block;background:#B82538;color:#fff;font-size:36px;font-weight:700;letter-spacing:12px;padding:16px 32px;border-radius:8px">${otp}</span>
          </div>
          <p style="color:#666;font-size:13px">This code expires in <strong>15 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#aaa;font-size:12px;text-align:center">Tunisian Thoracic Surgery Association &copy; 2026</p>
        </div>
      </div>
    `,
  });
}

async function sendReviewerInvitation(toEmail, firstName, tempPassword) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: 'TTSA – Invitation to Join the Scientific Committee as Reviewer',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#0C589A;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
          <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
        </div>
        <div style="padding:32px">
          <p style="font-size:16px">Dear Dr. <strong>${firstName}</strong>,</p>
          <p>We are honored to invite you to join the TTSA Scientific Committee as a reviewer for our upcoming congress.</p>
          <p>Thank you very much for accepting our invitation to contribute your expertise to the evaluation of abstract submissions.</p>
          <p>Your reviewer account has been created. Here are your credentials to log in for the first time:</p>
          
          <div style="background:#f0f7ff;border-left:4px solid #0C589A;padding:16px;border-radius:4px;margin:20px 0;font-size:14px;">
            <p style="margin:0 0 8px 0;">🌐 <strong>Portal URL:</strong> <a href="${process.env.APP_URL || 'https://ttsa.tn'}/login.html" style="color:#0C589A;font-weight:bold;text-decoration:none;">ttsa.tn/login.html</a></p>
            <p style="margin:0 0 8px 0;">📧 <strong>Email Address:</strong> ${toEmail}</p>
            <p style="margin:0;">🔑 <strong>Temporary Password:</strong> <code style="font-family:monospace;background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:14px;font-weight:bold;color:#1a202c;">${tempPassword}</code></p>
          </div>
          
          <p style="color:#B82538;font-weight:bold;font-size:14px;">⚠️ Note: For security reasons, you will be prompted to change your temporary password immediately upon your first login.</p>
          
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#aaa;font-size:12px;text-align:center">Tunisian Thoracic Surgery Association &copy; 2026</p>
        </div>
      </div>
    `,
  });
}

module.exports = {
  sendOTP,
  sendPasswordResetOTP,
  sendAbstractConfirmation,
  sendVerdict,
  sendFileUploadReminder,
  sendReviewerLoginOTP,
  sendAdminLoginOTP,
  sendReviewerInvitation,
};
