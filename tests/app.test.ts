import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const { enqueueReminder, reminderQueue, pool } = vi.hoisted(() => ({
  enqueueReminder: vi.fn(),
  reminderQueue: {
    getJob: vi.fn(),
  },
  pool: {
    query: vi.fn(),
  },
}));

vi.mock("../src/queue.js", () => ({
  enqueueReminder,
  reminderQueue,
}));

vi.mock("../src/db.js", () => ({
  pool,
}));

import { app } from "../src/app.js";

describe("app API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://localhost:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /jobs", () => {
    it("rejects an invalid loanId (0) with HTTP 400 before querying the database", async () => {
      const response = await fetch(`${baseUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: 0,
          email: "test@example.com",
          dueDate: "2026-10-15",
        }),
      });

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body).toEqual({
        error: "Provide a valid loanId, email, and dueDate.",
      });

      // Verify that database and queue dependencies were not called
      expect(pool.query).not.toHaveBeenCalled();
      expect(enqueueReminder).not.toHaveBeenCalled();
      expect(reminderQueue.getJob).not.toHaveBeenCalled();
    });

    it("successfully accepts a valid reminder job with HTTP 202", async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ job_id: "reminder-1-2026-10-15" }],
      });

      enqueueReminder.mockResolvedValueOnce({
        id: "reminder-1-2026-10-15",
      });

      const response = await fetch(`${baseUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: 1,
          email: "test@example.com",
          dueDate: "2026-10-15",
        }),
      });

      expect(response.status).toBe(202);

      const body = await response.json();
      expect(body).toEqual({
        message: "Reminder job accepted.",
        jobId: "reminder-1-2026-10-15",
        status: "queued",
        statusUrl: "/jobs/reminder-1-2026-10-15/status",
      });

      expect(pool.query).toHaveBeenCalledOnce();
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO reminder_logs"),
        [
          "loan-1-due-2026-10-15",
          "reminder-1-2026-10-15",
          1,
          "test@example.com",
          "2026-10-15",
        ],
      );
      expect(enqueueReminder).toHaveBeenCalledOnce();
      expect(enqueueReminder).toHaveBeenCalledWith(
        {
          loanId: 1,
          email: "test@example.com",
          dueDate: "2026-10-15",
        },
        "reminder-1-2026-10-15",
      );
    });

    it("returns HTTP 409 when a reminder for the loan and due date already exists", async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              job_id: "reminder-1-2026-10-15",
              status: "queued",
            },
          ],
        });

      const response = await fetch(`${baseUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: 1,
          email: "test@example.com",
          dueDate: "2026-10-15",
        }),
      });

      expect(response.status).toBe(409);

      const body = await response.json();
      expect(body).toEqual({
        error: "A reminder for this loan and due date already exists.",
        jobId: "reminder-1-2026-10-15",
        status: "queued",
      });

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("INSERT INTO reminder_logs"),
        [
          "loan-1-due-2026-10-15",
          "reminder-1-2026-10-15",
          1,
          "test@example.com",
          "2026-10-15",
        ],
      );
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("SELECT job_id, status"),
        ["loan-1-due-2026-10-15"],
      );
      expect(enqueueReminder).not.toHaveBeenCalled();
      expect(reminderQueue.getJob).not.toHaveBeenCalled();
    });

    it("returns HTTP 500 and updates reminder status to failed when enqueueing fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      pool.query
        .mockResolvedValueOnce({
          rows: [{ job_id: "reminder-1-2026-10-15" }],
        })
        .mockResolvedValueOnce({
          rows: [],
        });

      enqueueReminder.mockRejectedValueOnce(
        new Error("Queue service unavailable"),
      );

      const response = await fetch(`${baseUrl}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: 1,
          email: "test@example.com",
          dueDate: "2026-10-15",
        }),
      });

      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body).toEqual({
        error: "Failed to create reminder job.",
      });

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("INSERT INTO reminder_logs"),
        [
          "loan-1-due-2026-10-15",
          "reminder-1-2026-10-15",
          1,
          "test@example.com",
          "2026-10-15",
        ],
      );
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("UPDATE reminder_logs"),
        ["reminder-1-2026-10-15", "Queue service unavailable"],
      );

      expect(enqueueReminder).toHaveBeenCalledOnce();
      expect(enqueueReminder).toHaveBeenCalledWith(
        {
          loanId: 1,
          email: "test@example.com",
          dueDate: "2026-10-15",
        },
        "reminder-1-2026-10-15",
      );
      expect(reminderQueue.getJob).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
