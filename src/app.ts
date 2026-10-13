import express from "express";
import { enqueueReminder, reminderQueue } from "./queue.js";
import { pool } from "./db.js";

const app = express();
const PORT = 3001;

app.use(express.json());

// Submit a reminder job
app.post("/jobs", async (req, res) => {
  const { loanId, email, dueDate } = req.body ?? {};

  if (
    !Number.isInteger(loanId) ||
    loanId <= 0 ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof dueDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)) ||
    new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate
  ) {
    return res.status(400).json({
      error: "Provide a valid loanId, email, and dueDate.",
    });
  }

  const idempotencyKey = `loan-${loanId}-due-${dueDate}`;
  const jobId = `reminder-${loanId}-${dueDate}`;

  try {
    // Reserve this reminder in PostgreSQL first.
    const inserted = await pool.query(
      `INSERT INTO reminder_logs
        (idempotency_key, job_id, loan_id, email, due_date, status)
       VALUES ($1, $2, $3, $4, $5, 'queued')
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING job_id`,
      [idempotencyKey, jobId, loanId, email, dueDate],
    );

    // A reminder with this key already exists.
    if (inserted.rows.length === 0) {
      const existing = await pool.query(
        `SELECT job_id, status
         FROM reminder_logs
         WHERE idempotency_key = $1`,
        [idempotencyKey],
      );

      const record = existing.rows[0];

      return res.status(409).json({
        error: "A reminder for this loan and due date already exists.",
        jobId: record?.job_id,
        status: record?.status,
      });
    }

    try {
      // Only queue the job after its database record exists.
      const job = await enqueueReminder({ loanId, email, dueDate }, jobId);

      return res.status(202).json({
        message: "Reminder job accepted.",
        jobId: job.id,
        status: "queued",
        statusUrl: `/jobs/${job.id}/status`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await pool.query(
        `UPDATE reminder_logs
         SET status = 'failed',
             error_message = $2,
             updated_at = NOW()
         WHERE job_id = $1`,
        [jobId, message],
      );

      throw error;
    }
  } catch (error) {
    console.error("Failed to create reminder:", error);

    return res.status(500).json({
      error: "Failed to create reminder job.",
    });
  }
});

// Check a reminder job's status
app.get("/jobs/:id/status", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
          job_id,
          loan_id,
          email,
          due_date,
          status,
          attempts,
          message_id,
          error_message,
          created_at,
          updated_at,
          sent_at
       FROM reminder_logs
       WHERE job_id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Reminder record not found.",
      });
    }

    const record = result.rows[0];
    const job = await reminderQueue.getJob(record.job_id);
    const queueState = job ? await job.getState() : null;

    return res.status(200).json({
      jobId: record.job_id,
      loanId: record.loan_id,
      email: record.email,
      dueDate: record.due_date,
      status: record.status,
      attempts: record.attempts,
      messageId: record.message_id,
      errorMessage: record.error_message,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      sentAt: record.sent_at,
      queueState,
    });
  } catch (error) {
    console.error("Failed to retrieve reminder status:", error);

    return res.status(500).json({
      error: "Failed to retrieve reminder status.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Reminder API listening on http://localhost:${PORT}`);
});
