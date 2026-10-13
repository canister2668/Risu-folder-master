# assets-src/ 의 폴더 그림 템플릿을 배포용으로 만든다.
#   templates/<slug>.webp        512px 완성 그림(GitHub에서 받아 씀)
#   templates/blank/<slug>.webp  글씨 없는 종이판(글씨 바꾸기용)
#   templates/font.ttf, OFL.txt  글씨 합성 글꼴(Black Han Sans, OFL)
#   src/ui/templates-data.js     목록·종이 위치·96px 섬네일(플러그인에 내장)
import base64, io, json, os, shutil
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets-src')
OUT = os.path.join(ROOT, 'templates')

SLUG = {
    '판타지': 'fantasy', '현대물': 'modern', 'SF': 'sf', '무협': 'wuxia',
    '로맨스': 'romance', '학원물': 'school', '일상': 'daily', '호러': 'horror',
    '추리': 'mystery', '이세계': 'isekai', '대체역사': 'althistory', '종말물': 'apocalypse',
    '단일봇': 'single', '멀티봇': 'multi', '시뮬봇': 'sim', '2차창작': 'fanwork',
    '오리지널': 'original', '유틸도구': 'utility', '즐겨찾기': 'favorite', '쿰질용': 'kumjil',
    '제작중': 'wip', '테스트': 'test', '보관함': 'archive', '미분류': 'unsorted',
}

def webp(path, size, q):
    b = io.BytesIO()
    Image.open(path).convert('RGB').resize((size, size), Image.LANCZOS).save(b, 'WEBP', quality=q, method=6)
    return b.getvalue()

def main():
    meta = json.load(open(os.path.join(SRC, 'templates.json'), encoding='utf-8'))
    os.makedirs(os.path.join(OUT, 'blank'), exist_ok=True)
    items = []
    for t in meta:
        slug = SLUG[t['id']]
        open(os.path.join(OUT, slug + '.webp'), 'wb').write(webp(os.path.join(SRC, t['id'] + '.png'), 512, 90))
        open(os.path.join(OUT, 'blank', slug + '.webp'), 'wb').write(webp(os.path.join(SRC, 'blank', t['id'] + '.png'), 512, 92))
        thumb = base64.b64encode(webp(os.path.join(SRC, t['id'] + '.png'), 96, 72)).decode()
        items.append({'slug': slug, 'name': t['id'], 'cat': t['cat'], 'signs': t['signs'], 'thumb': 'data:image/webp;base64,' + thumb})
    shutil.copy(os.path.join(SRC, 'BlackHanSans-Regular.ttf'), os.path.join(OUT, 'font.ttf'))
    shutil.copy(os.path.join(SRC, 'OFL.txt'), os.path.join(OUT, 'OFL.txt'))
    js = ('// scripts/build-templates.py 가 만든다. 직접 고치지 말 것.\n'
          '// 폴더 그림 템플릿 목록: 이름·분류·종이 위치(512 기준 비율)·96px 섬네일.\n'
          'const TEMPLATES = ' + json.dumps(items, ensure_ascii=False) + ';\n')
    open(os.path.join(ROOT, 'src', 'ui', 'templates-data.js'), 'w', encoding='utf-8').write(js)
    print(len(items), 'templates,', round(len(js) / 1024), 'KB data')

if __name__ == '__main__':
    main()
