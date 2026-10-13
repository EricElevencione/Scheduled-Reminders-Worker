import "dotenv/config";
import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
  throw new Error("Missing SMTP environment variables.");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: Number(SMTP_PORT) === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export async function sendDueDateReminder(
  email: string,
  loanId: number,
  dueDate: string,
) {
  const info = await transporter.sendMail({
    from: `"Library Reminders" <${SMTP_USER}>`,
    to: email,
    subject: "Library Loan Due Date Reminder",
    text: `Reminder: loan ${loanId} is due on ${dueDate}. Please return the borrowed item on time.`,
  });

  console.log("Test email sent:", info.messageId);

  const previewUrl = nodemailer.getTestMessageUrl(info);

  if (previewUrl) {
    console.log("Preview email:", previewUrl);
  }

  return {
    messageId: info.messageId,
    previewUrl,
  };
}
