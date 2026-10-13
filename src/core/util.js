// 공용 도우미.

function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function debounce(fn, ms) {
  let timer = null;
  const run = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
  run.cancel = () => { clearTimeout(timer); timer = null; };
  return run;
}

function errorText(err) {
  return (err && err.message) || String(err);
}

function timeAgo(ts) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  let short;
  if (diff < 60e3) short = '방금';
  else if (diff < 3600e3) short = `${Math.floor(diff / 60e3)}분 전`;
  else if (diff < 86400e3) short = `${Math.floor(diff / 3600e3)}시간 전`;
  else if (diff < 30 * 86400e3) short = `${Math.floor(diff / 86400e3)}일 전`;
  else short = new Date(ts).toLocaleDateString('ko-KR', { year: '2-digit', month: 'short', day: 'numeric' });
  return { short, full: new Date(ts).toLocaleString('ko-KR') };
}

function imageMime(bytes) {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return '';
}

function toBytes(raw) {
  if (raw instanceof Uint8Array) return raw;
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  return null;
}
