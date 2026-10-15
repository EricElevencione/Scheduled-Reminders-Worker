import "dotenv/config";
import { fetchDueSoonLoans } from "./library-api.js";

const REMINDER_API_URL = process.env.REMINDER_API_URL;

export async function main() {
  const loans = await fetchDueSoonLoans();

  for (const loan of loans) {
    try {
      const dueDate = loan.dueAt.slice(0, 10);
      const response = await fetch(`${REMINDER_API_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: loan.id,
          email: loan.member.email,
          dueDate,
        }),
      });

      const data = await response.json();

      if (response.status === 409) {
        console.log(
          `Loan ${loan.id}: Duplicate reminder already exists (409 Conflict) - Job ${data.jobId}`,
        );
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `Request failed with status ${response.status}: ${JSON.stringify(data)}`,
        );
      }

      console.log(
        `Loan ${loan.id}: Reminder job accepted (202) - Job ${data.jobId}`,
      );
    } catch (error) {
      console.error(`Failed to process loan ${loan.id}:`, error);
    }
  }
}
