import type { SignOptions, VerifyOptions } from 'jsonwebtoken';

export const JWT_ISSUER = () => process.env.JWT_ISSUER || 'llm-assistant';
export const JWT_AUDIENCE = () => process.env.JWT_AUDIENCE || 'llm-assistant-api';

export function jwtSignOptions(expiresIn: SignOptions['expiresIn']): SignOptions {
  return {
    algorithm: 'HS256',
    expiresIn,
    issuer: JWT_ISSUER(),
    audience: JWT_AUDIENCE(),
  };
}

export function jwtVerifyOptions(): VerifyOptions {
  return {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER(),
    audience: JWT_AUDIENCE(),
  };
}
