import fs from 'node:fs';

const prod = fs.readFileSync('docker-compose.prod.yml', 'utf8');
const dev = fs.readFileSync('docker-compose.yml', 'utf8');
const dockerfile = fs.readFileSync('frontend/Dockerfile', 'utf8');
const nginxConf = fs.readFileSync('frontend/nginx.conf', 'utf8');
const nginxHeaders = fs.readFileSync('frontend/nginx/security-headers.conf', 'utf8');
const searx = fs.readFileSync('searxng/settings.yml', 'utf8');

const errors = [];
if (!/backend:[\s\S]*?ports:\s*!reset\s*\[\]/.test(prod)) {
  errors.push('prod backend ports are not reset');
}
if (!/127\.0\.0\.1:5432:5432/.test(dev)) {
  errors.push('dev postgres is not bound to 127.0.0.1');
}
if (!prod.includes('SEARXNG_SECRET:?')) {
  errors.push('prod does not require SEARXNG_SECRET');
}
if (/change_me_searxng_secret/.test(searx)) {
  errors.push('searxng settings.yml still contains the committed placeholder secret');
}
if (!dockerfile.includes('nginxinc/nginx-unprivileged:1.28-alpine')) {
  errors.push('frontend image is not nginxinc/nginx-unprivileged:1.28-alpine');
}
if (!/HEALTHCHECK[\s\S]*8080/.test(dockerfile)) {
  errors.push('frontend image has no HEALTHCHECK on port 8080');
}
if (!/3000:8080/.test(dev) || !/127\.0\.0\.1:3000:8080/.test(prod)) {
  errors.push('frontend is not published on container port 8080');
}
const locations = nginxConf.match(/location[^{]+\{/g) || [];
const includes = nginxConf.match(/include \/etc\/nginx\/security-headers\.conf;/g) || [];
if (locations.length === 0 || includes.length !== locations.length) {
  errors.push('nginx security headers are not included from every location');
}
if (/X-XSS-Protection/.test(nginxConf) || /X-XSS-Protection/.test(nginxHeaders)) {
  errors.push('nginx still sends X-XSS-Protection');
}
for (const needle of [
  'Referrer-Policy',
  'microphone=(self)',
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  'Strict-Transport-Security',
]) {
  const haystack = nginxConf + nginxHeaders;
  if (!haystack.includes(needle)) {
    errors.push(`nginx config is missing ${needle}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('compose hardening OK');
