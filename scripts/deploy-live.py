"""폴더 마스터를 운영 RisuAI(해적 b7487, LIVE-DB)에 직접 배포한다.

b7487은 플러그인 메타를 system.plugin_records, 본문을 system.plugin_scripts 에 둔다.
옛 folder_master_v3 기록이 있으면 같은 plugin_id 를 그대로 써서 교체한다(설치 위치·켜짐 상태 유지).
서버는 메타(이름·버전)를 재시작 전까지 메모리에 캐시하므로, 이름이 바뀌면 LIVE-SERVER 재시작이 필요하다.

사용: python3 scripts/deploy-live.py            # 드라이런
      python3 scripts/deploy-live.py --apply    # 실제 반영(백업은 backups/)
"""
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DB_CONTAINER = os.environ.get('FM_DB_CONTAINER', 'LIVE-DB')
COMMAND = ['docker', 'exec', '-i', DB_CONTAINER, 'sh', '-c',
           'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ' + os.environ.get('FM_DB_NAME', 'risuai_trial')]
NAMES = ('risu_folder_master', 'folder_master', 'folder_master_v3')


def sql(query):
    result = subprocess.run(COMMAND, input=query, text=True, capture_output=True)
    if result.returncode:
        errors = [line for line in result.stderr.splitlines() if line.startswith('ERROR:')]
        raise RuntimeError('; '.join(errors) or result.stderr.strip() or 'psql failed')
    return result.stdout.strip()


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def version_tuple(v):
    return tuple(int(x) for x in re.findall(r'\d+', v or '0')[:3]) or (0,)


bundle = pathlib.Path(os.environ.get('FM_BUNDLE') or (ROOT / 'dist' / 'risu-folder-master.plugin.js')).read_text()
assert '$deploy$' not in bundle and '\x00' not in bundle


def meta(key):
    return re.search(r'^//@' + key + r'\s+(.+)$', bundle, re.M).group(1).strip()


found_url = re.search(r'^//@update-url\s+(.+)$', bundle, re.M)
update_url = found_url.group(1).strip() if found_url else ''


names = ','.join(literal(n) for n in NAMES)
rows = json.loads(sql(f"""SELECT coalesce(json_agg(json_build_object('record', to_jsonb(r), 'script', s.script)), '[]')
FROM system.plugin_records r JOIN system.plugin_scripts s USING (plugin_id) WHERE r.name IN ({names});"""))
assert len(rows) == 1, f'expected exactly one folder master record, found {len(rows)}'
old = rows[0]
record = old['record']
old_v = version_tuple(record['plugin_version'])
new_v = version_tuple(meta('version'))
if not (old_v < new_v or (old_v == new_v and '--replace-same-version' in sys.argv) or (old_v > new_v and '--allow-downgrade' in sys.argv)):
    sys.exit(f'not a forward deployment ({record["plugin_version"]} -> {meta("version")}); same version needs --replace-same-version, lower needs --allow-downgrade')

new_hash = hashlib.md5(bundle.encode()).hexdigest()
old_hash = hashlib.md5(old['script'].encode()).hexdigest()
print(f'{record["name"]} {record["plugin_version"] or "(none)"} [{old_hash[:8]}] -> {meta("name")} {meta("version")} [{new_hash[:8]}] plugin_id={record["plugin_id"]}')
if '--apply' not in sys.argv:
    print('dry run; pass --apply to write')
    sys.exit(0)

backup = ROOT / 'backups' / ('live-folder-master-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.json')
backup.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
with backup.open('x') as out:
    backup.chmod(0o600)
    json.dump(old, out, ensure_ascii=False)

pid = record['plugin_id']
query = f"""BEGIN;
SET LOCAL standard_conforming_strings=on;
SELECT revision FROM system.storage_meta WHERE singleton=TRUE FOR UPDATE;
DO $deploy$ DECLARE audit_id bigint; BEGIN
IF NOT EXISTS (SELECT 1 FROM system.plugin_scripts WHERE plugin_id={literal(pid)} AND md5(script)={literal(old_hash)})
 THEN RAISE EXCEPTION 'plugin script changed since backup'; END IF;
IF NOT EXISTS (SELECT 1 FROM system.plugin_records r WHERE plugin_id={literal(pid)} AND to_jsonb(r)={literal(json.dumps(record))}::jsonb)
 THEN RAISE EXCEPTION 'plugin record changed since backup'; END IF;
INSERT INTO system.revisions(storage_revision, database_initialized, scope, action)
 SELECT revision + 1, TRUE, 'database', 'Folder Master deployment {meta('version')}'
 FROM system.storage_meta WHERE singleton=TRUE RETURNING id INTO audit_id;
PERFORM set_config('risu.revision_id', audit_id::text, TRUE);
UPDATE system.plugin_scripts SET script={literal(bundle)}, updated_at=NOW() WHERE plugin_id={literal(pid)};
UPDATE system.plugin_records SET name={literal(meta('name'))}, display_name={literal(meta('display-name'))},
 plugin_version={literal(meta('version'))}, update_url={literal(update_url)}, updated_at=NOW() WHERE plugin_id={literal(pid)};
UPDATE system.storage_meta SET revision=revision+1, initialized=TRUE, updated_at=NOW() WHERE singleton=TRUE;
END $deploy$;
COMMIT;"""
sql(query)
live = sql(f"SELECT md5(script) FROM system.plugin_scripts WHERE plugin_id={literal(pid)};")
assert live == new_hash, f'md5 mismatch after deploy: {live} != {new_hash}'
print(f'deployed; backup {backup}; md5 {new_hash}')
