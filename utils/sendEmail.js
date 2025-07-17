const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_HOST,
    pass: process.env.EMAIL_PASS
  }
});

const sendEmail = async (to, subject, text) => {
  return await transporter.sendMail({
    from: process.env.EMAIL_HOST,
    to,
    subject,
    html: text
  });
};

module.exports = sendEmail;
