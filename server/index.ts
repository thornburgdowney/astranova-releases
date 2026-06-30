import "dotenv/config";
import express from "express";
import path from "path";
import { createServer } from "http";
import { registerRoutes } from "./routes";

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    console.log(`${req.method} ${req.path}`);
  }
  next();
});

(async () => {
  await registerRoutes(app);

  // Serve built React app
  const clientDist = path.join(__dirname, "..", "dist", "client");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });

  const port = parseInt(process.env.PORT || "3001", 10);
  httpServer.listen(port, "127.0.0.1", () => {
    console.log(`AstraNovaAI desktop server listening on port ${port}`);
  });
})();
