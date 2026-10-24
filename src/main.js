// 시작: 메뉴 등록 + 사이드바 그리드 복원.

async function main() {
  try {
    await Risuai.registerSetting('Risu 폴더 마스터', () => openManager(), MENU_ICON, 'html', 'risu-folder-master');
  } catch (err) { console.log('[risu-folder-master] 설정 메뉴 등록 실패: ' + errorText(err)); }
  try {
    await Risuai.registerButton({ name: 'Risu 폴더 마스터', icon: MENU_ICON, iconType: 'html', location: 'hamburger', id: 'risu-folder-master' }, () => openManager());
  } catch (err) { console.log('[risu-folder-master] 메뉴 버튼 등록 실패: ' + errorText(err)); }
  try {
    await Risuai.onUnload(async () => {
      // 호스트가 1초만 기다리므로 즐겨찾기 폴더 정리를 가장 먼저 한다.
      clearInterval(cleanup.timer);
      try { await shortcutUnloadCleanup(); } catch {}
      endDrag();
      rosterStop();
      avatars.clear();
      ui.cancelSearch?.();
      await removeGridStyle();
      await clearSidebarMark(rootDoc);
      if (rootDoc) { try { await setRootStyle(rootDoc, SHORTCUT_GUARD_XID, ''); } catch {} }
    });
  } catch {}
  await startSidebarGrid();
  try { await shortcutStartup(); } catch {}
  console.log(`[risu-folder-master] v${FM_VERSION} 준비됨`);
}

main().catch((err) => console.log('[risu-folder-master] 시작 실패: ' + errorText(err)));
