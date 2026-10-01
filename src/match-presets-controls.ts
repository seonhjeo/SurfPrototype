import { createMatchPresetStore, MATCH_PRESETS_STORAGE_KEY, MATCH_PRESET_NAME_MAX_LENGTH, MATCH_PRESET_IMPORT_MAX_BYTES } from './match-presets';
import type { MatchSettings } from './game/match-settings';

type PresetAction = 'save' | 'rename' | 'overwrite' | 'delete';

/** Preset management persists independently of the match dialog's draft/confirm lifecycle. */
export function mountMatchPresetControls(root: HTMLElement, options: {
  readSettings: () => MatchSettings | null;
  applySettings: (settings: MatchSettings) => void;
  signal: AbortSignal;
}) {
  const store = createMatchPresetStore();
  root.className = 'settings-presets';
  root.innerHTML = `<div class="presets-heading"><label for="match-preset">내 프리셋</label><span>이 브라우저에 저장</span></div>
    <select id="match-preset" aria-describedby="preset-help"><option value="">저장된 프리셋이 없습니다</option></select>
    <div class="preset-actions"><button type="button" data-preset="load" disabled>불러오기</button><button type="button" data-preset="save">새로 저장</button><button type="button" data-preset="manage" aria-expanded="false" aria-controls="preset-manage" disabled>관리</button></div>
    <div id="preset-manage" class="preset-actions" hidden><button type="button" data-preset="overwrite">덮어쓰기</button><button type="button" data-preset="rename">이름 변경</button><button type="button" data-preset="delete" class="preset-danger">삭제</button></div>
    <div class="preset-editor" hidden><p class="preset-prompt"></p><label for="preset-name" class="sr-only">프리셋 이름</label><input id="preset-name" type="text" maxlength="${MATCH_PRESET_NAME_MAX_LENGTH}" autocomplete="off" placeholder="프리셋 이름 (최대 ${MATCH_PRESET_NAME_MAX_LENGTH}자)"><div class="preset-actions"><button type="button" data-preset="commit">저장</button><button type="button" data-preset="cancel">돌아가기</button></div></div>
    <div class="preset-files"><button type="button" data-preset="export" disabled>선택 내보내기</button><button type="button" data-preset="export-all" disabled>전체 내보내기</button><button type="button" data-preset="import">JSON 가져오기</button><input type="file" accept=".json,application/json" hidden aria-label="프리셋 JSON 파일"></div>
    <p id="preset-help">저장·변경·삭제는 바로 반영됩니다. 불러온 설정은 아래 ‘설정 완료’로 적용하세요.</p>
    <p class="preset-status" role="status"></p><p class="preset-error" role="alert"></p>`;
  const select = root.querySelector<HTMLSelectElement>('select')!;
  const editor = root.querySelector<HTMLElement>('.preset-editor')!;
  const name = root.querySelector<HTMLInputElement>('#preset-name')!;
  const file = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  const prompt = root.querySelector<HTMLElement>('.preset-prompt')!;
  const status = root.querySelector<HTMLElement>('.preset-status')!;
  const error = root.querySelector<HTMLElement>('.preset-error')!;
  const management = root.querySelector<HTMLElement>('#preset-manage')!;
  const button = (action: string) => root.querySelector<HTMLButtonElement>(`[data-preset="${action}"]`)!;
  let action: PresetAction | null = null;
  let targetId = '';
  let returnFocus: HTMLElement | null = null;
  let importing = false;

  const clearMessages = () => { status.textContent = ''; error.textContent = ''; };
  const showError = (reason: unknown) => {
    status.textContent = '';
    error.textContent = reason instanceof Error ? reason.message : '프리셋 작업을 완료하지 못했습니다.';
  };
  const closeEditor = (restoreFocus = false) => {
    editor.hidden = true; action = null; targetId = '';
    if (restoreFocus) returnFocus?.focus();
  };
  const closeManagement = () => {
    management.hidden = true; button('manage').setAttribute('aria-expanded', 'false');
  };
  const updateButtons = () => {
    for (const item of ['load', 'manage', 'export']) button(item).disabled = !select.value;
    if (!select.value) closeManagement();
  };
  const refresh = (selectedId = select.value) => {
    // A read failure does not silently replace a damaged document with an empty list.
    const presets = store.list();
    const placeholder = new Option(presets.length ? '프리셋을 선택하세요' : '저장된 프리셋이 없습니다', '');
    select.replaceChildren(placeholder, ...presets.map((preset) => new Option(preset.name, preset.id)));
    select.value = presets.some((preset) => preset.id === selectedId) ? selectedId : '';
    button('export-all').disabled = presets.length === 0;
    updateButtons();
  };
  const selectedName = () => select.selectedOptions[0]?.textContent ?? '';
  const readDraft = () => options.readSettings();
  const openEditor = (nextAction: PresetAction) => {
    if ((nextAction === 'save' || nextAction === 'overwrite') && !readDraft()) return;
    action = nextAction; targetId = select.value; returnFocus = button(nextAction);
    const named = nextAction === 'save' || nextAction === 'rename';
    name.hidden = !named; name.value = nextAction === 'rename' ? selectedName() : '';
    prompt.textContent = nextAction === 'save' ? '현재 설정을 새 프리셋으로 저장합니다.'
      : nextAction === 'rename' ? '새 이름을 입력하세요.'
      : nextAction === 'overwrite' ? `‘${selectedName()}’을 현재 설정으로 덮어쓸까요?`
      : `‘${selectedName()}’을 삭제할까요?`;
    button('commit').textContent = nextAction === 'delete' ? '삭제 확인' : nextAction === 'overwrite' ? '덮어쓰기 확인' : '저장';
    editor.hidden = false;
    if (named) { name.focus(); name.select(); } else button('cancel').focus();
  };
  const commit = () => {
    if (!action) return;
    clearMessages();
    try {
      let selectedId = targetId;
      let message = '';
      if (action === 'save' || action === 'overwrite') {
        const settings = readDraft();
        if (!settings) return;
        const saved = action === 'save' ? store.save(name.value, settings) : store.overwrite(targetId, settings);
        selectedId = saved.id; message = `‘${saved.name}’을 저장했습니다.`;
      } else if (action === 'rename') {
        const saved = store.rename(targetId, name.value);
        message = `‘${saved.name}’으로 이름을 변경했습니다.`;
      } else {
        store.delete(targetId); selectedId = ''; message = '프리셋을 삭제했습니다.';
      }
      closeEditor(); closeManagement(); refresh(selectedId); select.focus(); status.textContent = message;
    } catch (reason) { showError(reason); }
  };
  const exportFile = (id?: string) => {
    const json = store.exportJson(id);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = id ? 'surf-preset.json' : 'surf-presets.json';
    document.body.append(link); link.click(); link.remove();
    // Keep the object URL alive long enough for the browser to begin the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'JSON 파일 다운로드를 요청했습니다.';
  };

  select.addEventListener('change', () => { clearMessages(); closeEditor(); closeManagement(); updateButtons(); });
  name.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
  });
  root.addEventListener('click', (event) => {
    const control = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-preset]');
    if (!control) return;
    clearMessages();
    try {
      const requested = control.dataset.preset;
      if (requested === 'load') {
        options.applySettings(store.load(select.value)); closeEditor(); closeManagement();
        status.textContent = `‘${selectedName()}’을 불러왔습니다. 설정 완료를 누르면 적용됩니다.`;
      } else if (requested === 'save' || requested === 'rename' || requested === 'overwrite' || requested === 'delete') openEditor(requested);
      else if (requested === 'manage') {
        closeEditor(); management.hidden = !management.hidden;
        button('manage').setAttribute('aria-expanded', String(!management.hidden));
      } else if (requested === 'commit') commit();
      else if (requested === 'cancel') closeEditor(true);
      else if (requested === 'export') exportFile(select.value);
      else if (requested === 'export-all') exportFile();
      else if (requested === 'import') file.click();
    } catch (reason) { showError(reason); }
  });
  file.addEventListener('change', async () => {
    const selectedFile = file.files?.[0]; file.value = '';
    if (!selectedFile || importing) return;
    importing = true; button('import').disabled = true; clearMessages();
    try {
      if (selectedFile.size > MATCH_PRESET_IMPORT_MAX_BYTES) throw new Error('1 MiB 이하의 JSON 파일을 선택하세요.');
      const json = await selectedFile.text();
      if (options.signal.aborted) return;
      const imported = store.importJson(json);
      closeEditor(); closeManagement(); refresh(imported[0]?.id);
      status.textContent = `${imported.length}개 프리셋을 가져왔습니다. 같은 이름은 숫자를 붙여 추가했습니다. 적용하려면 불러오기를 누르세요.`;
    } catch (reason) { if (!options.signal.aborted) showError(reason); }
    finally { importing = false; button('import').disabled = false; }
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== MATCH_PRESETS_STORAGE_KEY && event.key !== null) return;
    try { refresh(); } catch (reason) { showError(reason); }
  }, { signal: options.signal });
  try { refresh(); } catch (reason) { showError(reason); }
}
