import cron from "node-cron";
import { main } from "./services/dispatcher.js";

let isRunning = false;

cron.schedule("*/5 * * * *", async () => {
  if (isRunning) {
    console.log("Previous dispatch still running; skipping this interval.");
    return;
  }

  isRunning = true;

  try {
    await main();
  } catch (error) {
    console.error("Scheduled dispatch failed:", error);
  } finally {
    isRunning = false;
  }
});

console.log("Scheduler started. Dispatch runs every 5 minutes.");
