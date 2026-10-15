import { app } from "./app.js";

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Reminder API listening on http://localhost:${PORT}`);
});
