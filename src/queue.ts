// queue.ts creates the queue and provides a way to add jobs.
// worker.ts listens for jobs and processes them.
// app.ts will eventually expose your HTTP API and let clients submit work.

import { Queue } from "bullmq";

export type ReminderJobData = {
  loanId: number;
  email: string;
  dueDate: string;
};

const connection = {
  host: "127.0.0.1",
  port: 6379,
};

// exports reminderQueue with the ReminderJobData into redis or connection
export const reminderQueue = new Queue<ReminderJobData>("loan-reminders", {
  connection,
});

// adds a job name send-due-date-reminder to the supplied data
export async function enqueueReminder(data: ReminderJobData, jobId?: string) {
  return reminderQueue.add("send-due-date-reminder", data, {
    ...(jobId ? { jobId } : {}),
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  });
}
