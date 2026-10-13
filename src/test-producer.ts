import { enqueueReminder, reminderQueue } from "./queue.js";

async function main() {
  try {
    const job = await enqueueReminder({
      loanId: 123,
      email: "student@example.com",
      dueDate: "2026-10-15",
    });

    console.log("Reminder job added to queue.");
    console.log("Job ID:", job.id);
  } catch (error) {
    console.error("Failed to enqueue reminder:", error);
    process.exitCode = 1;
  } finally {
    await reminderQueue.close();
  }
}

main();
