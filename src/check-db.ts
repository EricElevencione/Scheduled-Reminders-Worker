import { pool } from "./db";

async function main() {
  try {
    const result = await pool.query(`
  SELECT
      current_database() AS database_name,
      current_user AS connected_user,
      inet_server_addr() AS server_address,
      inet_server_port() AS server_port,
      version() AS server_version,
      has_table_privilege(
          current_user,
          'public.reminder_logs',
          'INSERT'
      ) AS can_insert
`);

    console.log(result.rows[0]);

    console.log("PostgreSQL connection successful!");
    console.log("Server version:", result.rows[0].version);
    console.log("Database:", result.rows[0].database);
    console.log("Port:", result.rows[0].port);
  } catch (error) {
    console.error("PostgreSQL connection failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
