import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchDueSoonLoans } = vi.hoisted(() => ({
  fetchDueSoonLoans: vi.fn(),
}));

vi.mock("../src/services/library-api.js", () => ({
  fetchDueSoonLoans,
}));

import { main } from "../src/services/dispatcher.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REMINDER_API_URL", "http://localhost:3001");
  });

  it("handles an existing reminder without treating it as a fatal error", async () => {
    fetchDueSoonLoans.mockResolvedValue([
      {
        id: 2,
        dueAt: "2026-10-15T00:00:00.000Z",
        member: { name: "Test Member", email: "test@example.com" },
        copy: { book: { title: "Test Book" } },
      },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({
          jobId: "reminder-2-2026-10-15",
        }),
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(main()).resolves.toBeUndefined();

    expect(fetchDueSoonLoans).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith(
      "Loan 2: Duplicate reminder already exists (409 Conflict) - Job reminder-2-2026-10-15",
    );
  });

  it("successfully submits a reminder job when the API responds with 202 Accepted", async () => {
    fetchDueSoonLoans.mockResolvedValue([
      {
        id: 1,
        dueAt: "2026-10-15T00:00:00.000Z",
        member: { name: "Test Member", email: "test@example.com" },
        copy: { book: { title: "Test Book" } },
      },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 202,
        ok: true,
        json: async () => ({
          jobId: "reminder-1-2026-10-15",
        }),
      }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(main()).resolves.toBeUndefined();

    expect(fetchDueSoonLoans).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("http://localhost:3001/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loanId: 1,
        email: "test@example.com",
        dueDate: "2026-10-15",
      }),
    });
    expect(logSpy).toHaveBeenCalledWith(
      "Loan 1: Reminder job accepted (202) - Job reminder-1-2026-10-15",
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("handles a non-409 error (HTTP 500) without crashing and continues processing remaining loans", async () => {
    fetchDueSoonLoans.mockResolvedValue([
      {
        id: 1,
        dueAt: "2026-10-15T00:00:00.000Z",
        member: { name: "Member One", email: "one@example.com" },
        copy: { book: { title: "Book One" } },
      },
      {
        id: 2,
        dueAt: "2026-10-16T00:00:00.000Z",
        member: { name: "Member Two", email: "two@example.com" },
        copy: { book: { title: "Book Two" } },
      },
    ]);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          status: 500,
          ok: false,
          json: async () => ({ error: "Internal Server Error" }),
        })
        .mockResolvedValueOnce({
          status: 202,
          ok: true,
          json: async () => ({
            jobId: "reminder-2-2026-10-16",
          }),
        }),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(main()).resolves.toBeUndefined();

    expect(fetchDueSoonLoans).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to process loan 1:",
      expect.objectContaining({
        message: 'Request failed with status 500: {"error":"Internal Server Error"}',
      }),
    );

    expect(logSpy).toHaveBeenCalledWith(
      "Loan 2: Reminder job accepted (202) - Job reminder-2-2026-10-16",
    );
  });

  it("rejects when fetching loans fails", async () => {
    fetchDueSoonLoans.mockRejectedValue(new Error("Failed to fetch due loans"));

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(main()).rejects.toThrow("Failed to fetch due loans");

    expect(fetchDueSoonLoans).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
