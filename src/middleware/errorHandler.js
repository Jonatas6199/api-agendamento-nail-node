class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Middleware central de erros - deve ser o último registrado no app
function errorHandler(err, req, res, next) {
  console.error(err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erro interno no servidor';

  // Erros conhecidos do Prisma (violação de unicidade, registro não encontrado, etc.)
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Registro já existente (violação de unicidade).' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Registro não encontrado.' });
  }

  res.status(statusCode).json({ error: message });
}

module.exports = { ApiError, errorHandler };
