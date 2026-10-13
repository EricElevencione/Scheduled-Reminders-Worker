# Scheduled Reminders & Notification Worker

A standalone Node.js and TypeScript backend project for processing scheduled reminders, email notifications, and periodic reports using background jobs.

## 1. Project Overview

This project explores how backend applications handle slow or scheduled tasks without making an HTTP request wait for the work to finish.

The system will identify library loans that are due soon, enqueue reminder jobs, and process them in a separate background worker. It will also support periodic report generation.

Clients can submit jobs, receive an immediate `202 Accepted` response, and check job progress through a status endpoint.

This is a standalone project, separate from the existing Library API codebase. It can obtain loan information from the Library API through HTTP when integration is added.

## 2. Why Use Background Workers?

Some tasks take too long to perform inside a normal HTTP request, such as sending an email through an external service or generating a large report.

Without background processing, the request may remain open while the task runs, increasing response time and the risk of timeouts.

With a background worker:

1. The application creates a job and adds it to a queue.
2. The API responds with `202 Accepted` without waiting for completion.
3. A separate worker picks up and processes the job.
4. The system records the job's status so clients can check its progress.

The work may finish a few seconds later, which is acceptable for reminders and reports. This introduces **eventual consistency**: the result may not be available immediately, but should become available after successful processing.

## 3. System Architecture

```text
           Scheduler (node-cron)
                    |
                    v
          Find loans due soon
           or report work
                    |
                    v
          BullMQ Queue + Redis
                    |
                    v
          Background Worker
                    |
           +--------+--------+
           |                 |
           v                 v
      Send Reminder     Generate Report
      (Nodemailer)       (Report Logic)
           |                 |
           +--------+--------+
                    |
                    v
           Track Job Status
            (JobLog Table)
                    |
                    v
         GET /jobs/:id/status
```

The scheduler and API act as job producers. They add work to the queue, while the separate worker processes that work asynchronously.

## 4. Planned Features

- **Background job queue:** Use BullMQ and Redis to queue work for processing.
- **Separate worker:** Process jobs independently of HTTP request handlers.
- **Scheduled reminders:** Run a daily schedule, such as 8:00 AM, to identify loans due soon and enqueue reminder jobs.
- **Email notifications:** Use Nodemailer with a test SMTP service such as Ethereal Email.
- **Periodic reports:** Generate reports as background jobs.
- **Retries and backoff:** Retry failed jobs after increasing delays.
- **Idempotency:** Prevent duplicate reminder emails when jobs are retried.
- **Job tracking:** Store job IDs, statuses, and timestamps in a `JobLog` database table.
- **Job status endpoint:** Allow clients to check a job's progress.
- **Immediate API response:** Return `202 Accepted` when work has been accepted for background processing.
- **Security:** Validate requests and ensure workers follow appropriate authorization rules.

## 5. Technology Stack

| Technology     | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| Node.js        | JavaScript runtime                                     |
| TypeScript     | Static typing                                          |
| Express        | HTTP API endpoints                                     |
| BullMQ         | Queue management, workers, retries, and delayed jobs   |
| Redis          | Queue storage and coordination                         |
| `node-cron`    | Recurring schedules                                    |
| Nodemailer     | Email delivery                                         |
| Ethereal Email | Testing email delivery without sending real emails     |
| PostgreSQL     | Persistent job-status and idempotency records          |
| Prisma         | Database access, if used for the job-tracking database |

The project can reuse the Redis server from the URL Shortener project while using a separate BullMQ queue name. The applications remain separate codebases.

## 6. Planned API Endpoints

| Method | Endpoint           | Purpose                                                                |
| ------ | ------------------ | ---------------------------------------------------------------------- |
| `POST` | `/jobs`            | Accept a supported job request and return `202 Accepted` with a job ID |
| `GET`  | `/jobs/:id/status` | Return the job's current status and relevant timestamps                |

These endpoints are planned and will be defined during implementation. Scheduled jobs can also be created internally without an HTTP request.

Possible job states include:

- `queued` — Waiting to be processed.
- `active` — Currently being processed.
- `completed` — Finished successfully.
- `failed` — Failed after processing attempts.

## 7. Reliability: Retries and Idempotency

### Retries and exponential backoff

A job may fail because an email service is temporarily unavailable or a network request times out. BullMQ can retry failed jobs.

Example configuration:

```typescript
{
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000
  }
}
```

This allows up to three processing attempts, with exponential delays beginning at five seconds.

### Idempotency

A retry can happen after an email provider accepts an email but before the worker records the successful result. Without safeguards, the same reminder could be sent twice.

To reduce this risk, the system will use a stable idempotency key, such as a combination of the loan ID, reminder type, and due date. The key will be stored and checked in the database before processing.

**Important:** A database check alone cannot guarantee exactly-once email delivery when the database and email provider do not share a transaction. The implementation must account for this limitation.

## 8. Security Considerations

- Validate incoming job requests.
- Authenticate and authorize protected API endpoints.
- Prevent clients from submitting unauthorized job types or accessing other users' loan data.
- Ensure scheduled jobs process only data they are authorized to access.
- Store SMTP credentials and database URLs in environment variables.
- Avoid logging credentials, API keys, or sensitive email content.

Background workers must respect the same data-access and authorization rules as the API.

## 9. Development Roadmap

1. Initialize the standalone Node.js and TypeScript project.
2. Connect to the existing Redis server.
3. Create a BullMQ queue and a separate worker.
4. Add a test job and verify that the worker processes it.
5. Configure retry and exponential backoff behavior.
6. Add recurring schedules with `node-cron`.
7. Integrate with the Library API to obtain loan information.
8. Implement due-date reminder jobs and test email delivery with Ethereal.
9. Add persistent job-status tracking and idempotency records.
10. Implement `POST /jobs` and `GET /jobs/:id/status`.
11. Add periodic report generation.
12. Test successful processing, retries, duplicate prevention, and service failures.

## 10. Learning Outcomes

By completing this project, I aim to understand:

- Why slow tasks should not block HTTP responses.
- How job queues and background workers communicate.
- How to schedule recurring tasks.
- How retries and exponential backoff improve reliability.
- How idempotency reduces duplicate side effects.
- How to track job lifecycles and expose progress through an API.
- How eventual consistency affects clients and background processing.
- How to apply authentication, authorization, and secret management to worker-based systems.

## 11. Portfolio Value

Background processing is a common backend engineering requirement. This project demonstrates practical experience with job queues, worker processes, scheduled tasks, retry policies, idempotency, email integration, and job-status tracking.

The goal is not simply to enqueue work, but to build a system that behaves predictably when jobs are delayed, retried, or fail.

## Project Status

**In progress.**

This project is being developed as a standalone application. The features described above are planned and should not be considered complete until implemented and tested.
