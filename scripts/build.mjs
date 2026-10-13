// src/ 를 순서대로 이어 붙여 dist/risu-folder-master.plugin.js 하나로 만든다(번들러 없음).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const UPDATE_URL = 'https://raw.githubusercontent.com/canister2668/Risu-folder-master/main/dist/risu-folder-master.plugin.js';

export const SOURCES = [
  'src/core/util.js',
  'src/core/order.js',
  'src/core/store.js',
  'src/core/roster.js',
  'src/sidebar/grid.js',
  'src/sidebar/locate.js',
  'src/ui/icons.js',
  'src/ui/styles.js',
  'src/ui/dialogs.js',
  'src/ui/templates-data.js',
  'src/ui/iconpicker.js',
  'src/ui/app.js',
  'src/ui/drag.js',
  'src/main.js',
];

const header = [
  '//@name risu_folder_master',
  `//@display-name 📁 Risu 폴더 마스터 v${pkg.version}`,
  '//@api 3.0',
  `//@version ${pkg.version}`,
  // 업데이트 주소는 공개 배포(--release) 때만 넣는다. GitHub 공개를 보류한 동안 라이브 시험판에 넣으면
  // 저장소에 남은 옛 판을 새 버전으로 안내하게 된다.
  ...(process.argv.includes('--release') ? [`//@update-url ${UPDATE_URL}`] : []),
  '',
  `// Risu 폴더 마스터 v${pkg.version} — RisuAI 봇 폴더 관리 + 사이드바 여러 열 배열`,
  '// 소스: https://github.com/canister2668/Risu-folder-master (이 파일은 scripts/build.mjs 가 만든다. 직접 고치지 말 것)',
  '//',
  '// Copyright (C) 2026 Canister',
  '// SPDX-License-Identifier: GPL-3.0-only',
  '// 이 프로그램은 GNU General Public License 3판으로 배포합니다. 보증은 없습니다. 전문: 저장소의 LICENSE',
  '// RisuAI(https://github.com/kwaroran/RisuAI, GPL-3.0, Copyright (C) Kwaroran)의 플러그인 API v3를 씁니다.',
  '// RisuAI 공식 플러그인이 아니며, RisuAI 개발자와 관계없습니다.',
  '',
].join('\n');

const body = SOURCES.map((f) => `// ── ${f} ──\n${readFileSync(join(root, f), 'utf8').trim()}\n`).join('\n');
const out = `${header}(() => {\n'use strict';\nconst FM_VERSION = ${JSON.stringify(pkg.version)};\n\n${body}})();\n`;
for (const bad of ['\u0000', '$deploy$']) if (out.includes(bad)) throw new Error('bundle contains forbidden text: ' + JSON.stringify(bad));
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/risu-folder-master.plugin.js'), out);
console.log(`dist/risu-folder-master.plugin.js v${pkg.version} ${(out.length / 1024).toFixed(1)} KB`);
