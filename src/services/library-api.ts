import "dotenv/config";

export type DueSoonLoan = {
  id: number;
  dueAt: string;
  member: {
    name: string;
    email: string;
  };
  copy: {
    book: {
      title: string;
    };
  };
};

export async function fetchDueSoonLoans(): Promise<DueSoonLoan[]> {
  const baseUrl = process.env.LIBRARY_API_URL;

  if (!baseUrl) {
    throw new Error("LIBRARY_API_URL is not configured");
  }

  const response = await fetch(`${baseUrl}/loans/due-soon`);

  if (!response.ok) {
    throw new Error(`Failed to fetch loans: ${response.status}`);
  }

  const loans = (await response.json()) as DueSoonLoan[];

  return loans;
}
