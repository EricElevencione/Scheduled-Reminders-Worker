import { fetchDueSoonLoans } from "./services/library-api.js";

async function main() {
  const loans = await fetchDueSoonLoans();

  // 1. Print how many loans were returned.
  const returnedLoans = loans.length;
  console.log(returnedLoans);
  // 2. Print the loan data so you can inspect its shape.
  console.dir(loans, { depth: null });
}

main().catch((error) => {
  console.error("Failed to fetch due-soon loans:", error);
  process.exitCode = 1;
});
