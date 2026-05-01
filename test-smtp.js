require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('\n📧 Testing SMTP connection...');
console.log('   Host:', process.env.SMTP_HOST);
console.log('   Port:', process.env.SMTP_PORT);
console.log('   User:', process.env.SMTP_USER);
console.log('   Pass:', process.env.SMTP_PASS ? '***set***' : '❌ NOT SET');
console.log('   From:', process.env.EMAIL_FROM);
console.log('');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP connection FAILED:');
    console.error('   Error:', err.message);
    console.error('\n💡 Things to check:');
    console.error('   1. Is SMTP_PASS set correctly in .env?');
    console.error('   2. Is the mailbox noreply@ttsa.tn created in your hosting panel?');
    console.error('   3. Try SMTP_PORT=465 and SMTP_SECURE=true if port 587 fails');
  } else {
    console.log('✅ SMTP connection SUCCESS! Server is ready to send emails.');
    // Send a test email to admin
    transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.ADMIN_EMAIL,
      subject: 'TTSA – SMTP Test',
      text: 'SMTP is working correctly. Emails from noreply@ttsa.tn are operational.',
    }, (err2, info) => {
      if (err2) console.error('❌ Test email failed:', err2.message);
      else console.log('✅ Test email sent! Check your inbox at', process.env.ADMIN_EMAIL);
    });
  }
});
