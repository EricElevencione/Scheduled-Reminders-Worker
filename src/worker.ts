import { Worker } from "bullmq";
import type { ReminderJobData } from "./queue.js";
import { pool } from "./db.js";
import { sendDueDateReminder } from "./services/emails.js";

const connection = {
  host: "127.0.0.1",
  port: 6379,
};

const worker = new Worker<ReminderJobData>(
  "loan-reminders",
  async (job) => {
    if (!job.id) {
      throw new Error("Reminder job is missing its ID.");
    }

    const attemptNumber = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;

    await pool.query(
      `UPDATE reminder_logs
       SET status = 'processing',
           attempts = $2,
           error_message = NULL,
           updated_at = NOW()
       WHERE job_id = $1`,
      [job.id, attemptNumber],
    );

    try {
      const result = await sendDueDateReminder(
        job.data.email,
        job.data.loanId,
        job.data.dueDate,
      );

      await pool.query(
        `UPDATE reminder_logs
         SET status = 'sent',
             message_id = $2,
             error_message = NULL,
             sent_at = NOW(),
             updated_at = NOW()
         WHERE job_id = $1`,
        [job.id, result.messageId],
      );

      return {
        success: true,
        messageId: result.messageId,
        previewUrl: result.previewUrl,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      const finalAttempt = attemptNumber >= maxAttempts;

      await pool.query(
        `UPDATE reminder_logs
         SET status = $2,
             error_message = $3,
             updated_at = NOW()
         WHERE job_id = $1`,
        [job.id, finalAttempt ? "failed" : "queued", message],
      );

      throw error;
    }
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully.`);
});

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

worker.on("error", (error) => {
  console.error("Worker error:", error.message);
});

console.log("Reminder worker is waiting for jobs...");
