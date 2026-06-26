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

async function sendFileUploadReminder(toEmail, firstName, abstractTitle, uploadDeadline) {
  const transporter = createTransporter();
  const deadlineStr = uploadDeadline ? new Date(uploadDeadline * 1000).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : 'soon';
  await transporter.sendMail({
    from: FROM,
    to: toEmail,
    subject: 'TTSA – Reminder: Please Upload Your Presentation File',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#0C589A;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">TTSA</h1>
          <p style="color:#cfe2ff;margin:4px 0 0">Tunisian Thoracic Surgery Association</p>
        </div>
        <div style="padding:32px">
          <p>Dear <strong>${firstName}</strong>,</p>
          <p>This is a friendly reminder that your abstract has been <strong style="color:#166534">accepted</strong> by the scientific committee, but we have not yet received your final presentation file.</p>
          <div style="background:#f0f7ff;border-left:4px solid #0C589A;padding:16px;border-radius:4px;margin:16px 0">
            <strong>Abstract:</strong> ${abstractTitle}
          </div>
          <div style="background:#fff7ed;border-left:4px solid #f97316;padding:16px;border-radius:4px;margin:16px 0">
            ⏰ <strong>Upload deadline:</strong> ${deadlineStr}
          </div>
          <p>Please log in to your participant portal and upload your presentation file (PowerPoint or PDF) before the deadline.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="${process.env.APP_URL || 'http://localhost:3000'}/member/dashboard.html" style="display:inline-block;background:#0C589A;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700">Go to My Portal →</a>
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

module.exports = {
  sendOTP,
  sendPasswordResetOTP,
  sendAbstractConfirmation,
  sendVerdict,
  sendFileUploadReminder,
  sendReviewerLoginOTP,
};
