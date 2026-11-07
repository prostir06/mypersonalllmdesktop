import fs from 'node:fs';

const prod = fs.readFileSync('docker-compose.prod.yml', 'utf8');
const dev = fs.readFileSync('docker-compose.yml', 'utf8');
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
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('compose hardening OK');
