// 공개판 점검: dist 에 업데이트 주소가 있고, 버전이 이미 공개된 최고 버전보다 높은지 본다.
// 사용: node scripts/build.mjs --release && node scripts/check-release.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = readFileSync(join(root, 'dist/risu-folder-master.plugin.js'), 'utf8');
const head = bundle.slice(0, 600);
const version = head.match(/^\/\/@version\s+(\S+)/m)?.[1];
const url = head.match(/^\/\/@update-url\s+(\S+)/m)?.[1];
const errors = [];
if (!url) errors.push('//@update-url 이 없습니다. node scripts/build.mjs --release 로 빌드하세요');
const published = process.env.FM_LAST_PUBLIC || '0.0.0'; // GitHub 에 이미 공개된 최고 버전(공개할 때마다 올린다)
const num = (v) => (v || '0').split('.').map(Number);
const newer = (a, b) => { const x = num(a); const y = num(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
if (published !== '0.0.0' && !newer(version, published)) errors.push(`버전 ${version} 이 이미 공개된 ${published} 보다 높지 않아 사용자에게 업데이트로 보이지 않습니다`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`release ok: v${version}, ${url}`);
