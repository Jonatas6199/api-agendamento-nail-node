const { ApiError } = require('./errorHandler');
const { validateAdminSession } = require('../services/adminSessionService');

function requireHttps(req, _res, next) {
  if (process.env.NODE_ENV !== 'production') return next();

  const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (req.secure || forwardedProtocol === 'https') return next();

  return next(new ApiError(403, 'O painel administrativo exige uma conexão HTTPS.'));
}

async function requireAdmin(req, _res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    const apiKey = req.headers['x-admin-api-key'];
    const auth = await validateAdminSession(token, apiKey);

    req.admin = {
      id: auth.adminUser.id,
      username: auth.adminUser.username,
      sessionId: auth.session.id,
      expiresAt: auth.session.expiresAt,
    };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireHttps, requireAdmin };
