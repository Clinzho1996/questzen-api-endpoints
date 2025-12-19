import nodemailer from 'nodemailer';
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
export async function sendWelcomeEmail(email: string, displayName: string) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@questzen.app',
      to: email,
      subject: 'Welcome to QuestZen AI! 🎯',
      html: `
        <h1>Welcome to QuestZen AI, ${displayName}! 🎉</h1>
        <p>We're excited to have you on board. Start your journey to achieving your goals with AI-powered guidance.</p>
        <p>Get started by creating your first quest!</p>
      `
    });
  } catch (error) {
    console.error('Email sending error:', error);
  }
}
export async function sendGoalReminderEmail(email: string, goalTitle: string) {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@questzen.app',
      to: email,
      subject: `Reminder: ${goalTitle} 📌`,
      html: `
        <h2>Don't forget about your quest!</h2>
        <p><strong>${goalTitle}</strong></p>
        <p>Keep up the momentum and complete your tasks today.</p>
      `
    });
  } catch (error) {
    console.error('Email sending error:', error);
  }
}