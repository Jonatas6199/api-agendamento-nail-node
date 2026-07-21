import swaggerJSDoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API Agendamento | Leticia Dalla",
      version: "1.0.0",
      description: "API RESTful para agendamentos"
    },
    servers: [
      {
        url: process.env.BASE_URL || "http://localhost:3000"
      }
    ]
  },
  apis: ["./src/routes.js"] // onde estão os comentários
};

export const swaggerSpec = swaggerJSDoc(options);