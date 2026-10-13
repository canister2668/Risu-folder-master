// 관리 화면 CSS. 플러그인 iframe 안에서만 쓰인다.
// 모바일 GPU 부담 때문에 backdrop-filter·큰 blur 그림자는 쓰지 않는다.

const FOLDER_HEX = {
  default: '#3a4254',
  red: '#b4313f',
  yellow: '#a8741a',
  green: '#1f8a4c',
  blue: '#2858d6',
  indigo: '#4b45c6',
  purple: '#7d34c9',
  pink: '#c0337a',
};

const COLOR_NAMES = {
  default: '기본', red: '빨강', yellow: '노랑', green: '초록', blue: '파랑', indigo: '남색', purple: '보라', pink: '분홍',
};

const APP_CSS = `
:root{
  --bg:#0f1218;--panel:#141820;--surface:#191e28;--surface-2:#1f2532;--line:#272e3c;--line-2:#323a4b;
  --text:#e7eaf1;--muted:#8d95a8;--faint:#5f6779;--accent:#6c7cff;--accent-2:#8f9bff;--accent-bg:#232a4a;
  --danger:#ef5a6a;--ok:#3ccf91;--radius:12px;
  color-scheme:dark;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:transparent;overflow:hidden}
body{font:13px/1.45 Pretendard,"Pretendard Variable",-apple-system,BlinkMacSystemFont,"Segoe UI","Apple SD Gothic Neo","Noto Sans KR",sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer;background:none;border:0}
button:disabled{cursor:default;opacity:.4}
:focus-visible{outline:2px solid var(--accent-2);outline-offset:2px}
.fm-i{width:18px;height:18px;flex:none}
.fm-root{position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:rgba(5,7,12,.74)}
.fm-app{user-select:none;-webkit-user-select:none;position:relative;width:min(1140px,100%);height:min(840px,100%);display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.45)}

/* 상단 */
.fm-top{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line);background:var(--panel)}
.fm-brand{display:flex;align-items:center;gap:10px;min-width:0;margin-right:4px}
.fm-logo{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff;background:linear-gradient(140deg,#5967f0,#8a55e6)}
.fm-logo .fm-i{width:19px;height:19px}
.fm-brand b{display:block;font-size:15px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.fm-brand small{display:block;font-size:11px;color:var(--muted);white-space:nowrap}
.fm-search{position:relative;flex:1;min-width:120px;max-width:440px}
.fm-search .fm-i{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--faint);width:16px;height:16px}
.fm-search input{user-select:text;-webkit-user-select:text;width:100%;height:36px;padding:0 12px 0 34px;border-radius:10px;border:1px solid var(--line);background:var(--bg);outline:none}
.fm-search input:focus{border-color:var(--accent)}
.fm-search input::placeholder{color:var(--faint)}
.fm-spacer{flex:1}
.fm-seg{display:flex;padding:3px;gap:2px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}
.fm-seg button{width:30px;height:28px;border-radius:7px;display:grid;place-items:center;color:var(--muted)}
.fm-seg button:hover{color:var(--text)}
.fm-seg button.on{background:var(--surface-2);color:var(--text)}
.fm-btn{height:36px;padding:0 12px;border-radius:10px;display:inline-flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--line);white-space:nowrap;font-weight:550}
.fm-btn:hover:not(:disabled){background:var(--surface-2);border-color:var(--line-2)}
.fm-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.fm-btn.primary:hover:not(:disabled){background:#7a89ff;border-color:#7a89ff}
.fm-btn.danger{color:#ffb3bc;border-color:#4a2530;background:#2a161c}
.fm-btn.danger:hover:not(:disabled){background:#3a1b23;border-color:#6b2b3a}
.fm-btn.ghost{background:transparent;border-color:transparent}
.fm-btn.ghost:hover:not(:disabled){background:var(--surface)}
.fm-btn .fm-sub{font-size:11px;font-weight:500;color:var(--muted)}
.fm-btn.on{border-color:var(--accent);background:var(--accent-bg)}
.fm-icon{width:36px;padding:0;justify-content:center}
.fm-menu-wrap{position:relative}
.fm-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:40;min-width:210px;padding:6px;border-radius:12px;background:var(--surface);border:1px solid var(--line-2);box-shadow:0 14px 34px rgba(0,0,0,.45);display:none}
.fm-menu.open{display:block}
.fm-menu button{width:100%;height:36px;padding:0 10px;border-radius:8px;display:flex;align-items:center;gap:9px;text-align:left}
.fm-menu button:hover:not(:disabled){background:var(--surface-2)}
.fm-menu small{margin-left:auto;color:var(--faint);font-size:11px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[hidden]{display:none!important}
.fm-mob{display:none!important}
.fm-only-mobile{display:none!important}
.fm-menu button.on{color:var(--accent-2)}
.fm-busy{display:none;align-items:center;gap:6px;color:var(--muted);font-size:12px}
.fm-app.is-busy .fm-busy{display:inline-flex}
.fm-loading{display:none;align-items:center;gap:6px;color:var(--muted);font-size:12px;white-space:nowrap}
.fm-app.is-loading .fm-loading{display:inline-flex}
.fm-loading:disabled{opacity:1;cursor:default}
.fm-loading.warn{color:#f3c46b;cursor:pointer}
.fm-loading.warn::before{background:#f3c46b;animation:none}
.fm-loading::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ok);animation:fm-pulse 1s ease-in-out infinite}
.fm-card.loading .fm-name{color:var(--faint)}
.fm-busy::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);animation:fm-pulse 1s ease-in-out infinite}
@keyframes fm-pulse{50%{opacity:.25}}

/* 순서 편집 띠 */
.fm-banner{display:none;align-items:center;gap:10px;padding:9px 14px;background:#1a2142;border-bottom:1px solid #2c3770;color:#cfd6ff}
.fm-app.is-reorder .fm-banner{display:flex}
.fm-banner p{flex:1;font-size:12.5px}
.fm-banner b{color:#fff}

/* 본문 */
.fm-body{flex:1;display:grid;grid-template-columns:250px minmax(0,1fr);min-height:0}
.fm-rail{min-height:0;overflow:auto;padding:10px 8px 20px;border-right:1px solid var(--line);background:var(--panel);overscroll-behavior:contain}
.fm-rail-label{display:flex;align-items:center;justify-content:space-between;padding:14px 10px 6px;font-size:11px;font-weight:650;letter-spacing:.06em;color:var(--faint)}
.fm-nav{position:relative;width:100%;min-height:42px;padding:6px 8px;border-radius:10px;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:10px;text-align:left;color:#c7ccd8}
.fm-nav:hover{background:var(--surface)}
.fm-nav.on{background:var(--surface-2);color:#fff}
.fm-nav.on::before{content:"";position:absolute;left:-8px;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;background:var(--accent)}
.fm-nav-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}
.fm-nav-count{min-width:24px;height:20px;padding:0 7px;border-radius:10px;display:grid;place-items:center;font-size:11px;color:var(--muted);background:var(--bg)}
.fm-nav.empty .fm-nav-name{color:var(--faint);text-decoration:line-through}
.fm-thumb{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;overflow:hidden;color:#fff;background:var(--c,#3a4254)}
.fm-thumb .fm-i{width:16px;height:16px}
.fm-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.fm-thumb.plain{background:var(--surface-2);color:var(--muted)}
.fm-nav .fm-grip{display:none;color:var(--faint)}
.fm-app.is-reorder .fm-nav[data-folder]{cursor:grab}
.fm-app.is-reorder .fm-nav[data-folder] .fm-nav-count{display:none}
.fm-app.is-reorder .fm-nav[data-folder] .fm-grip{display:block}

.fm-main{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0;min-width:0}
.fm-head{display:flex;align-items:center;gap:12px;padding:14px 18px 12px;min-width:0}
.fm-head .fm-thumb{width:42px;height:42px;border-radius:11px}
.fm-back{position:relative;flex:none;border-radius:12px;transition:transform .12s}
.fm-back:hover .fm-thumb{filter:brightness(1.15)}
.fm-back:active{transform:scale(.95)}
.fm-back-arrow{position:absolute;left:-5px;bottom:-5px;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#fff;border:2px solid var(--bg)}
.fm-back-arrow .fm-i{width:12px;height:12px;stroke-width:2.6}
.fm-head .fm-thumb .fm-i{width:21px;height:21px}
.fm-head-text{min-width:0;flex:1}
.fm-head-text h2{font-size:18px;font-weight:700;letter-spacing:-.015em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-head-text p{font-size:12px;color:var(--muted);margin-top:1px}
.fm-head-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.fm-scroll{min-height:0;overflow:auto;padding:2px 18px 110px;overscroll-behavior:contain}
.fm-section{margin-bottom:22px;content-visibility:auto;contain-intrinsic-size:auto 240px}
.fm-section-head{display:flex;align-items:center;gap:8px;margin:4px 0 10px;min-width:0}
.fm-section-head .fm-dot{width:9px;height:9px;border-radius:3px;background:var(--c,#3a4254);flex:none}
.fm-section-head h3{font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-section-head span{font-size:12px;color:var(--faint)}
.fm-section-head button{margin-left:auto;font-size:12px;color:var(--muted);padding:3px 8px;border-radius:7px}
.fm-section-head button:hover{background:var(--surface);color:var(--text)}
.fm-empty{padding:34px 12px;text-align:center;color:var(--faint);border:1px dashed var(--line-2);border-radius:var(--radius)}

/* 폴더 타일(첫 화면의 주인공) */
/* 폴더: 탐색기처럼 큰 폴더 아이콘 + 아래 이름 */
.fm-folders{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px}
.fm-ftile{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px 8px;border-radius:12px;border:1px solid transparent;text-align:center;transition:background-color .12s,border-color .12s}
.fm-ftile:hover{background:var(--surface);border-color:var(--line)}
.fm-ftile .fm-thumb{width:58px;height:58px;border-radius:15px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.fm-ftile .fm-thumb .fm-i{width:28px;height:28px}
.fm-fcount{position:absolute;top:5px;left:calc(50% + 17px);min-width:22px;height:20px;padding:0 6px;border-radius:10px;display:grid;place-items:center;font-size:11px;font-weight:700;color:#fff;background:#2b3245;border:2px solid var(--bg)}
.fm-ftile-text{width:100%;min-width:0}
.fm-ftile-text b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;font-weight:600;line-height:1.3;word-break:keep-all;overflow-wrap:anywhere}
.fm-ftile .fm-grip{display:none;position:absolute;top:6px;left:6px;width:14px;height:14px;color:var(--faint)}
.fm-app.is-reorder .fm-ftile{cursor:grab}
.fm-app.is-reorder .fm-ftile .fm-grip{display:block}
.fm-ftile.empty b{color:var(--faint);text-decoration:line-through}
.fm-ftile.fm-drop-before{box-shadow:-3px 0 0 -1px var(--accent)}
.fm-ftile.fm-drop-after{box-shadow:3px 0 0 -1px var(--accent)}

/* 봇: 관리용이라 작게(아바타 34px 줄 칩) */
.fm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:6px;min-height:46px;border-radius:var(--radius)}
.view-list .fm-grid{grid-template-columns:minmax(0,1fr);gap:3px}
.fm-card{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:9px;padding:5px 8px 5px 5px;border-radius:10px;background:var(--surface);border:1px solid transparent;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:border-color .12s,background-color .12s}
.fm-card:hover{border-color:var(--line-2)}
.fm-av{position:relative;width:34px;height:34px;border-radius:8px;overflow:hidden;display:grid;place-items:center;background:var(--surface-2);color:var(--faint);font-size:14px;font-weight:700}
.fm-av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.fm-txt{min-width:0}
.fm-name{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-meta{display:flex;flex-wrap:nowrap;overflow:hidden;gap:8px;font-size:10.5px;color:var(--muted);min-height:14px}
.fm-meta span{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
.fm-meta .fm-i{width:11px;height:11px}
.view-tiles .fm-meta .fm-extra{display:none}
.fm-card.ghost-bot .fm-name{color:var(--danger)}
.fm-tick{position:absolute;left:1px;top:1px;width:17px;height:17px;border-radius:50%;display:grid;place-items:center;background:rgba(10,12,18,.75);border:1.5px solid rgba(255,255,255,.6);color:transparent;opacity:0;transition:opacity .12s}
.fm-tick .fm-i{width:10px;height:10px;stroke-width:3}
.fm-card:hover .fm-tick,.has-selection .fm-tick{opacity:1}
.fm-card.sel{border-color:var(--accent);background:var(--accent-bg)}
.fm-card.sel .fm-tick{opacity:1;background:var(--accent);border-color:var(--accent);color:#fff}
.view-list .fm-card{grid-template-columns:30px minmax(0,1fr);padding:3px 10px 3px 4px}
.view-list .fm-av{width:30px;height:30px;font-size:12px}
.view-list .fm-txt{display:flex;align-items:center;gap:14px}
.view-list .fm-name{flex:1;min-width:0}
.view-list .fm-meta{flex:none}
.fm-main .fm-note{margin:4px 0 16px}
.fm-warn{color:#f3c46b}
.fm-card.failed .fm-name{color:#f3c46b}
.fm-card:focus-visible{outline:2px solid var(--accent-2);outline-offset:1px}
.fm-card:focus-within .fm-loc{opacity:1}
.fm-loc:focus-visible{opacity:1}
.fm-app.is-locating .fm-loc,.fm-app.is-locating [data-act="locate-folder"]{pointer-events:none;opacity:.35}
.fm-count{padding:0 10px 0 6px;font-weight:700;white-space:nowrap;border-radius:8px;min-height:34px}
.fm-count:hover{background:rgba(255,255,255,.06)}
.fm-sheet{display:grid;gap:6px;margin-top:8px}
.fm-sheet .fm-btn{height:44px;justify-content:flex-start}
.fm-pick-search{display:block;max-width:none;margin:10px 0 8px}
.fm-pick-search input{height:40px}
.fm-picker .fm-nav{min-height:44px}
.fm-picker .fm-nav-name{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3}
.fm-picker .fm-nav:disabled{opacity:.5;cursor:default}
.fm-pick-new{margin-top:6px;border-top:1px solid var(--line);border-radius:0 0 10px 10px;padding-top:10px}
.fm-ghost-dest{grid-column:1/-1;font-size:11px;font-weight:650;color:var(--accent-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fm-ghost-dest:empty{display:none}
.fm-card{grid-template-columns:34px minmax(0,1fr) auto}
.view-list .fm-card{grid-template-columns:30px minmax(0,1fr) auto}
.fm-loc{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:var(--faint);opacity:0;transition:opacity .12s,background-color .12s}
.fm-loc .fm-i{width:16px;height:16px}
.fm-card:hover .fm-loc{opacity:1}
.fm-loc:hover{background:var(--surface-2);color:var(--accent-2)}
.fm-app.is-reorder .fm-loc{display:none}
@media (hover:none){.fm-loc{opacity:.75}}
.fm-link{color:var(--accent-2);font-weight:650;text-decoration:underline;text-underline-offset:2px}

/* 선택 막대 */
.fm-selbar{position:absolute;left:50%;bottom:18px;z-index:30;display:flex;align-items:center;gap:6px;padding:7px;border-radius:14px;background:var(--surface-2);border:1px solid var(--line-2);box-shadow:0 14px 34px rgba(0,0,0,.5);transform:translate(-50%,140%);opacity:0;visibility:hidden;transition:transform .18s ease,opacity .18s,visibility .18s;max-width:calc(100% - 24px)}
.has-selection .fm-selbar{transform:translate(-50%,0);opacity:1;visibility:visible}
.fm-app.is-reorder .fm-selbar{transform:translate(-50%,140%);opacity:0;visibility:hidden}
.fm-selbar .fm-btn{height:34px}

/* 끌어 옮기기 */
.fm-app.is-reorder .fm-card{cursor:grab}
.fm-app.is-reorder .fm-tick{display:none}
.fm-dragging{opacity:.3}
.fm-ghost{position:fixed;z-index:100;pointer-events:none;left:0;top:0;width:190px;display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:9px;padding:5px 8px 5px 5px;border-radius:12px;background:var(--surface-2);border:1px solid var(--accent);box-shadow:0 16px 36px rgba(0,0,0,.55)}
.fm-ghost-count{position:absolute;top:-8px;right:-8px;min-width:24px;height:24px;padding:0 7px;border-radius:12px;display:grid;place-items:center;background:var(--accent);color:#fff;font-size:12px;font-weight:700}
.fm-ghost.nav{width:220px;padding:6px 8px;display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:center}
.fm-drop-before{box-shadow:-4px 0 0 -1px var(--accent)}
.fm-drop-after{box-shadow:4px 0 0 -1px var(--accent)}
.view-list .fm-drop-before,.fm-nav.fm-drop-before{box-shadow:0 -3px 0 -1px var(--accent)}
.view-list .fm-drop-after,.fm-nav.fm-drop-after{box-shadow:0 3px 0 -1px var(--accent)}
.fm-drop-into{background:var(--accent-bg)!important;box-shadow:inset 0 0 0 1.5px var(--accent)}
.fm-grid.fm-drop-into{outline:1.5px dashed var(--accent);outline-offset:4px;box-shadow:none}

/* 알림·대화상자 */
.fm-toast{position:fixed;left:50%;bottom:96px;z-index:200;transform:translateX(-50%);display:flex;align-items:center;gap:12px;max-width:min(560px,calc(100vw - 24px));padding:10px 12px 10px 16px;border-radius:12px;background:#262d3d;border:1px solid var(--line-2);box-shadow:0 12px 30px rgba(0,0,0,.5);font-weight:550;animation:fm-in .16s ease}
.fm-toast.error{background:#3a1b23;border-color:#6b2b3a;color:#ffd5da}
.fm-toast button{padding:5px 10px;border-radius:8px;background:rgba(255,255,255,.08);font-weight:650;white-space:nowrap}
.fm-toast button:hover{background:rgba(255,255,255,.16)}
@keyframes fm-in{from{opacity:0;transform:translate(-50%,8px)}}
.fm-modal-back{position:fixed;inset:0;z-index:150;display:grid;place-items:center;padding:16px;background:rgba(4,6,10,.62)}
.fm-modal{width:min(420px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:18px;border-radius:16px;background:var(--panel);border:1px solid var(--line-2);box-shadow:0 24px 60px rgba(0,0,0,.55)}
.fm-modal h3{font-size:16px;font-weight:700;margin-bottom:4px}
.fm-modal .fm-desc{color:var(--muted);font-size:12.5px;margin-bottom:14px;white-space:pre-line}
.fm-modal .fm-field{width:100%;height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--line-2);background:var(--bg);outline:none}
.fm-modal .fm-field:focus{border-color:var(--accent)}
.fm-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.fm-label{display:block;margin:14px 0 7px;font-size:12px;font-weight:650;color:var(--muted)}
.fm-options{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.fm-options.cols4{grid-template-columns:repeat(4,1fr)}
.fm-options.cols2{grid-template-columns:repeat(2,1fr)}
.fm-option{min-height:44px;padding:8px 6px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:#c3c9d6;font-weight:600;line-height:1.25}
.fm-option small{display:block;font-size:10.5px;font-weight:500;color:var(--faint);margin-top:2px}
.fm-option:hover{border-color:var(--line-2)}
.fm-option.on{border-color:var(--accent);background:var(--accent-bg);color:#fff}
.fm-preview{display:flex;gap:10px;margin-top:14px;padding:12px;border-radius:12px;background:var(--bg);border:1px solid var(--line)}
.fm-mini{display:grid;gap:3px;align-content:start;padding:6px;border-radius:8px;background:var(--surface);flex:none}
.fm-mini i{width:12px;height:12px;border-radius:3px;background:#4a5366}
.fm-mini i.f{background:var(--accent)}
.fm-preview p{font-size:12px;color:var(--muted);align-self:center}
.fm-preview b{color:var(--text)}
.fm-note{margin-top:12px;padding:10px 12px;border-radius:10px;background:#1b2238;border:1px solid #2b355c;color:#c6cdf0;font-size:12px}
.fm-note.warn{background:#2e2216;border-color:#5a4020;color:#f3d7ac}
.fm-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.fm-swatch{height:54px;border-radius:12px;border:2px solid transparent;background:var(--c);color:#fff;font-size:12px;font-weight:650;display:grid;place-items:end start;padding:6px 8px}
.fm-swatch.on{border-color:#fff}
.fm-picker{display:grid;gap:4px;max-height:50vh;overflow:auto;margin:0 -4px;padding:0 4px}
.fm-picker .fm-nav{grid-template-columns:30px minmax(0,1fr) auto}
.fm-report{display:grid;gap:10px}
.fm-report section{padding:10px 12px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}
.fm-report h4{font-size:12.5px;margin-bottom:6px}
.fm-report li{list-style:none;font-size:12px;color:var(--muted);padding:2px 0;word-break:break-all}
.fm-report li b{color:var(--text);font-weight:600}
.fm-image-row{display:flex;gap:14px;align-items:center}
.fm-image-row .fm-thumb{width:72px;height:72px;border-radius:14px}
.fm-image-row .fm-thumb .fm-i{width:30px;height:30px}
.fm-image-row div{display:grid;gap:8px;flex:1}

/* 폴더 그림 고르기 */
.fm-modal.fm-wide{width:min(660px,100%);padding:0;display:flex;flex-direction:column;overflow:hidden}
.fm-ip{display:flex;flex-direction:column;min-height:0;max-height:calc(100vh - 32px)}
.fm-ip-head{display:flex;align-items:center;gap:10px;padding:14px 12px 6px 18px}
.fm-ip-head h3{margin:0}
.fm-ip-head small{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fm-ip-x{margin-left:auto}
.fm-ip-prev{display:flex;align-items:center;gap:14px;padding:6px 18px 14px;border-bottom:1px solid var(--line)}
.fm-ip-pv{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:var(--muted)}
.fm-ip-big{width:96px;height:96px;border-radius:14px;overflow:hidden;background:#fff;border:1px solid var(--line-2);display:grid;place-items:center}
.fm-ip-big.empty{background:var(--surface)}
.fm-ip-big img,.fm-ip-big canvas{width:100%;height:100%;display:block;object-fit:cover}
.fm-ip-big .fm-thumb,.fm-ip-sb .fm-thumb{width:100%;height:100%;border-radius:0}
.fm-ip-big .fm-thumb .fm-i{width:34px;height:34px}
.fm-ip-arrow{color:var(--faint);font-size:20px}
.fm-ip-side{margin-left:auto;display:flex;flex-direction:column;gap:6px;font-size:11px;color:var(--muted)}
.fm-ip-sb{display:flex;gap:6px;padding:6px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}
.fm-ip-sb div{width:58px;height:58px;border-radius:10px;overflow:hidden;background:var(--surface)}
.fm-ip-sb img,.fm-ip-sb canvas{width:100%;height:100%;display:block;object-fit:cover}
.fm-ip-tabs{display:flex;gap:4px;padding:10px 12px 0}
.fm-ip-tabs button{padding:8px 13px;border-radius:9px 9px 0 0;color:var(--muted);font-weight:650}
.fm-ip-tabs button.on{background:var(--surface);color:var(--text)}
.fm-ip-body{margin:0 10px;padding:12px;border-radius:0 12px 12px 12px;background:var(--surface);overflow:auto;flex:1;min-height:240px}
.fm-ip-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.fm-ip-chips button{padding:4px 11px;border-radius:999px;border:1px solid var(--line-2);color:var(--muted);font-size:12px}
.fm-ip-chips button.on{background:var(--accent-bg);border-color:var(--accent);color:#fff}
.fm-ip-sec{font-size:12px;color:var(--muted);margin:2px 2px 6px}
.fm-ip-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:6px;margin-bottom:12px}
.fm-ip-tile{display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 3px;border-radius:10px;border:1px solid transparent}
.fm-ip-tile:hover{background:var(--surface-2)}
.fm-ip-tile.on{border-color:var(--accent);background:var(--accent-bg)}
.fm-ip-tile img{width:66px;height:66px;border-radius:10px;background:#fff;display:block}
.fm-ip-tile b{font-size:11.5px;font-weight:600}
.fm-ip-edit{position:sticky;bottom:-12px;z-index:1;display:flex;align-items:center;gap:8px;padding:10px;border-radius:10px;background:var(--bg);border:1px solid var(--line);box-shadow:0 -8px 16px var(--surface)}
.fm-ip-edit .fm-field{flex:1;min-width:0;height:36px}
.fm-ip-nm{flex:1;min-width:0}.fm-ip-nm b{display:block}.fm-ip-nm small{color:var(--muted);font-size:11.5px}
.fm-ip-hint{font-size:11.5px;color:var(--faint);margin-top:8px}
.fm-ip-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:220px;border:1.5px dashed var(--line-2);border-radius:12px;color:var(--muted);cursor:pointer;text-align:center;padding:0 12px}
.fm-ip-drop b{color:var(--text)}
.fm-ip-drop .fm-i{width:26px;height:26px}
.fm-ip-crop{display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:center}
.fm-ip-cropbox{width:220px;height:220px;border-radius:12px;overflow:hidden;position:relative;background:#000;touch-action:none;cursor:grab;flex:none}
.fm-ip-cropbox img{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none;max-width:none}
.fm-ip-cropctl{display:flex;flex-direction:column;gap:10px;color:var(--muted);font-size:12px}
.fm-ip-cropctl label{display:flex;flex-direction:column;gap:4px}
.fm-ip-foot{display:flex;align-items:center;gap:8px;padding:12px 14px}
.fm-ftile,.fm-nav{-webkit-touch-callout:none}
.fm-ctx{position:fixed;z-index:160;min-width:168px;padding:5px;border-radius:12px;background:var(--panel);border:1px solid var(--line-2);box-shadow:0 14px 34px rgba(0,0,0,.55)}
.fm-ctx h4{font-size:11.5px;color:var(--muted);font-weight:600;padding:6px 9px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
.fm-ctx button{display:flex;align-items:center;gap:9px;width:100%;padding:8px 9px;border-radius:8px;text-align:left}
.fm-ctx button:hover,.fm-ctx button:focus-visible{background:var(--surface-2)}
.fm-ctx button.danger{color:#ffb3bc}

@media (max-width:760px){
  .fm-mob{display:inline-flex!important}
  .fm-nav.fm-mob{display:grid!important}
  .fm-desk{display:none!important}
  .fm-head .fm-btn,.fm-selbar .fm-btn{height:44px}
  .fm-selbar .fm-text,.fm-head .fm-text{display:inline!important}
  .fm-top .fm-text{display:inline!important}
  .fm-top .fm-btn{padding:0 9px}
  .fm-brand div{display:none}
  .fm-loc{width:36px;height:36px}
  .fm-only-mobile{display:inline!important}
  .fm-menu .fm-only-mobile{display:flex!important}
  .fm-only-desktop{display:none}
  .fm-seg{display:none}
  .fm-top .fm-btn .fm-sub{display:none}
  .fm-root{padding:0}
  .fm-app{width:100%;height:100%;border-radius:0;border:0}
  .fm-top{flex-wrap:wrap;gap:8px;padding:10px}
  .fm-brand small{display:none}
  .fm-search{order:10;flex:1 1 100%;max-width:none}
  .fm-btn .fm-text{display:none}
  .fm-btn:not(.fm-icon){padding:0 10px}
  .fm-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .fm-rail{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;padding:8px 10px;border-right:0;border-bottom:1px solid var(--line);scrollbar-width:none}
  .fm-rail::-webkit-scrollbar{display:none}
  .fm-rail-label{display:none}
  .fm-nav{width:auto;flex:none;min-height:38px;grid-template-columns:24px auto auto;gap:7px;padding:5px 9px 5px 6px;background:var(--surface)}
  .fm-nav.on::before{display:none}
  .fm-nav.on{background:var(--accent-bg);box-shadow:inset 0 0 0 1px var(--accent)}
  .fm-nav .fm-thumb{width:24px;height:24px;border-radius:7px}
  .fm-nav-name{max-width:120px}
  .fm-head{flex-wrap:wrap;padding:12px 12px 8px}
  .fm-head:not(.compact) .fm-head-actions{width:100%;justify-content:flex-start}
  .fm-scroll{padding:2px 12px 120px}
  .fm-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px}
  .fm-folders{grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:4px}
  .fm-ftile .fm-thumb{width:52px;height:52px;border-radius:14px}
  .fm-fcount{left:calc(50% + 14px)}
  .fm-selbar{left:10px;right:10px;bottom:10px;transform:translateY(160%);max-width:none;flex-wrap:wrap;justify-content:center}
  .has-selection .fm-selbar{transform:none}
  .fm-app.is-reorder .fm-selbar{transform:translateY(160%);opacity:0;visibility:hidden}
  .fm-selbar .fm-count{flex:1 1 100%;text-align:center;padding:2px 0 4px}
  .fm-toast{bottom:150px}
}
@media (max-width:480px){
  .fm-folders{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media (max-width:560px){
  .fm-modal-back:has(.fm-wide){padding:0}
  .fm-modal.fm-wide{width:100%;height:100%;max-height:none;border-radius:0;border:0}
  .fm-ip{max-height:none;height:100%}
  .fm-ip-side{display:none}
  .fm-ip-big{width:80px;height:80px}
  .fm-ip-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .fm-ip-tile img{width:100%;height:auto;aspect-ratio:1}
  .fm-ip-body{margin:0 8px}
}
`;
