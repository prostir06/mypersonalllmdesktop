const crypto = require('crypto');

/**
 * Attach a request id (from X-Request-Id or generated UUID) and echo it on the response.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requestId(req, res, next) {
  const incoming = req.header('x-request-id');
  const id =
    incoming && typeof incoming === 'string' && incoming.trim()
      ? incoming.trim().slice(0, 128)
      : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = requestId;
