import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes.js";

import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 Swagger endpoint
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API
app.use("/v1", routes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
  console.log(`Swagger em /docs`);
});