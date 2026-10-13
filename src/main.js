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
      endDrag();
      rosterStop();
      avatars.clear();
      ui.cancelSearch?.();
      await removeGridStyle();
      await clearSidebarMark(rootDoc);
    });
  } catch {}
  await startSidebarGrid();
  console.log(`[risu-folder-master] v${FM_VERSION} 준비됨`);
}

main().catch((err) => console.log('[risu-folder-master] 시작 실패: ' + errorText(err)));
