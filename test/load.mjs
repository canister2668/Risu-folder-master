// src 파일을 하나의 vm 문맥에 올려 함수 선언을 꺼내 쓴다.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// expose: const 로 선언한 이름은 문맥 속성이 아니므로 따로 꺼낸다.
export function load(files, extra = {}, expose = []) {
  const ctx = vm.createContext({ console, crypto: globalThis.crypto, setTimeout, clearTimeout, ...extra });
  for (const f of files) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
  if (expose.length) vm.runInContext(`Object.assign(globalThis, { ${expose.join(', ')} })`, ctx);
  return ctx;
}
