import { createMatchSettings, MATCH_SETTING_DEFINITIONS, validateMatchSettings } from './game/match-settings';
import type { EnvironmentSettings, MatchSettingDefinition, MatchSettings } from './game/match-settings';
import { MAPS, WEATHER } from './game/data';
import type { Environment, MapId, ModeRules, WeatherId } from './game/data';
import { matchRuleDetails } from './game/mode-description';
import { mountMatchPresetControls } from './match-presets-controls';

type Option = { enabled: boolean; amount?: number | null; count?: number | null; laneCount?: number };
type Field = 'amount' | 'count' | 'laneCount';
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function mountDialog(title: string, subtitle: string) {
  const events = new AbortController();
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `<div class="settings-header"><div><p class="eyebrow">MATCH SETTINGS</p><h2 id="settings-title">${title}</h2><p>${subtitle}</p></div><button type="button" class="settings-close" data-close aria-label="설정창 닫기">×</button></div>`;
  document.body.append(dialog);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    events.abort();
    dialog.close(); dialog.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  };
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-close]')) close();
    else if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }
  });
  return { dialog, close, signal: events.signal };
}

export function openMatchSettingsDialog(settings: MatchSettings, destination: 'ai' | 'room', onConfirm: (settings: MatchSettings) => void): () => void {
  const { dialog, close, signal } = mountDialog('경기를 설정하세요', `${destination === 'ai' ? 'AI와 대전' : '비공개 방 만들기'} · 설정을 마치면 덱을 준비합니다.`);
  let draft = structuredClone(settings);
  let lastLaneCount = draft.lanes.count || 1;
  const customValues = new Map<string, number>();
  const form = document.createElement('form');
  form.className = 'settings-form';
  form.innerHTML = `<div class="settings-scroll"><p class="settings-note">양 진영에 같은 설정이 적용됩니다. 이동 라인과 포탑 배치 라인은 각각 정할 수 있어요.</p><div class="settings-sections"></div></div><div class="settings-footer"><p class="settings-error" role="alert"></p><div class="settings-footer-top"><button class="text-button" type="button" data-reset>기본값으로 초기화</button><span>1. 경기 설정 <b>→</b> 2. 덱 준비</span></div><div class="settings-actions"><button class="button secondary" type="button" data-close>취소</button><button class="button primary" type="submit">설정 완료 <span aria-hidden="true">→</span></button></div></div>`;
  dialog.append(form);
  const sections = form.querySelector<HTMLElement>('.settings-sections')!;
  const error = form.querySelector<HTMLElement>('.settings-error')!;
  const option = (key: keyof MatchSettings) => draft[key] as Option;
  const numberControl = (definition: MatchSettingDefinition, field: Field, label: string, min: number, max: number, step: number, unit: string) => {
    const id = `setting-${definition.key}-${field}`;
    return `<div class="quantity-row"><label for="${id}">${label}</label><div class="quantity-control"><button type="button" data-step="-1" data-field="${field}" aria-label="${label} 줄이기">−</button><input id="${id}" type="number" inputmode="${step < 1 ? 'decimal' : 'numeric'}" data-field="${field}" aria-label="${label}" min="${min}" max="${max}" step="${step}" required><button type="button" data-step="1" data-field="${field}" aria-label="${label} 늘리기">＋</button></div><span>${unit}</span></div>`;
  };
  const refreshRow = (definition: MatchSettingDefinition) => {
    const row = sections.querySelector<HTMLElement>(`[data-setting="${definition.key}"]`)!;
    const value = option(definition.key);
    const toggle = row.querySelector<HTMLInputElement>('[data-enabled]')!;
    toggle.checked = value.enabled;
    row.classList.toggle('is-off', !value.enabled);
    row.querySelector<HTMLElement>('[data-toggle-label]')!.textContent = value.enabled ? 'ON' : 'OFF';
    const defaultToggle = row.querySelector<HTMLInputElement>('[data-default]');
    if (defaultToggle) { defaultToggle.disabled = !value.enabled; defaultToggle.checked = value[definition.field!] === null; }
    for (const field of [definition.field, definition.extra?.field]) {
      if (!field) continue;
      const input = row.querySelector<HTMLInputElement>(`input[data-field="${field}"]`)!;
      const amount = value[field];
      input.value = String(amount ?? customValues.get(definition.key) ?? definition.fallback ?? definition.min);
      input.disabled = (definition.key !== 'lanes' && !value.enabled) || amount === null;
      row.querySelectorAll<HTMLButtonElement>(`button[data-field="${field}"]`).forEach((button) => {
        button.disabled = input.disabled || (Number(button.dataset.step) < 0 ? Number(input.value) <= Number(input.min) : Number(input.value) >= Number(input.max));
      });
    }
  };
  const refreshEnvironment = () => {
    form.querySelector<HTMLSelectElement>('#setting-map')!.value = draft.environment.map;
    form.querySelector<HTMLSelectElement>('#setting-weather')!.value = draft.environment.weather;
    form.querySelector<HTMLElement>('#setting-map-help')!.textContent = draft.environment.map === 'random'
      ? '준비방 진입 때 맵을 무작위로 정합니다.' : MAPS[draft.environment.map].gimmickDescription;
    form.querySelector<HTMLElement>('#setting-weather-help')!.textContent = draft.environment.weather === 'random'
      ? '준비방 진입 때 날씨를 무작위로 정합니다.' : WEATHER[draft.environment.weather].description;
  };
  const render = () => {
    const groups = ['전장과 병력', '성채와 구조물', 'SP 획득'];
    sections.innerHTML = `<section class="settings-group settings-environment"><h3>환경</h3><div class="setting-row"><label for="setting-map">맵</label><select id="setting-map" data-environment="map" aria-describedby="setting-map-help"><option value="random">무작위</option>${Object.values(MAPS).map((map) => `<option value="${map.id}">${map.name}</option>`).join('')}</select><p id="setting-map-help"></p></div><div class="setting-row"><label for="setting-weather">날씨</label><select id="setting-weather" data-environment="weather" aria-describedby="setting-weather-help"><option value="random">무작위</option>${Object.values(WEATHER).map((weather) => `<option value="${weather.id}">${weather.name}</option>`).join('')}</select><p id="setting-weather-help"></p></div><p class="settings-note">재대전에서도 선택한 맵·날씨를 유지합니다. 무작위 항목만 다시 추첨합니다.</p></section>`
      + groups.map((group) => `<section class="settings-group"><h3>${group}</h3>${MATCH_SETTING_DEFINITIONS.filter((definition) => definition.section === group).map((definition) => `<div class="setting-row" data-setting="${definition.key}"><div class="setting-heading"><div><h4>${definition.label}</h4><p id="help-${definition.key}">${definition.help}</p></div><label class="setting-switch"><input type="checkbox" role="switch" data-enabled aria-label="${definition.label} 사용" aria-describedby="help-${definition.key}"><span class="switch-track" aria-hidden="true"></span><span data-toggle-label aria-hidden="true"></span></label></div>${definition.defaultLabel ? `<label class="setting-default"><input type="checkbox" data-default>${definition.defaultLabel}</label>` : ''}${definition.extra ? numberControl(definition, definition.extra.field, definition.extra.label, definition.extra.min, definition.extra.max, definition.extra.step, definition.extra.unit) : ''}${definition.field ? numberControl(definition, definition.field, definition.key === 'towers' ? '라인당 포탑 수' : `${definition.label} ${definition.field === 'count' ? '수량' : '획득량'}`, definition.min!, definition.max!, definition.step!, definition.unit!) : ''}</div>`).join('')}</section>`).join('');
    refreshEnvironment();
    MATCH_SETTING_DEFINITIONS.forEach(refreshRow);
  };
  render();
  const readSettings = () => {
    if (!form.reportValidity()) return null;
    error.textContent = '';
    try { return validateMatchSettings(draft); }
    catch (reason) { error.textContent = reason instanceof Error ? reason.message : '설정을 확인해 주세요.'; return null; }
  };
  const presets = document.createElement('section');
  form.querySelector('.settings-scroll')!.prepend(presets);
  mountMatchPresetControls(presets, {
    signal,
    readSettings,
    applySettings: (settings) => {
      draft = settings; customValues.clear(); lastLaneCount = draft.lanes.count || 1;
      error.textContent = ''; render();
    },
  });
  form.addEventListener('change', (event) => {
    const input = event.target as HTMLSelectElement;
    if (input.dataset.environment === 'map') draft.environment.map = input.value as MapId | 'random';
    else if (input.dataset.environment === 'weather') draft.environment.weather = input.value as WeatherId | 'random';
    else return;
    error.textContent = ''; refreshEnvironment();
  });
  form.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    const row = input.closest<HTMLElement>('[data-setting]');
    const definition = MATCH_SETTING_DEFINITIONS.find((entry) => entry.key === row?.dataset.setting);
    if (!definition) return;
    error.textContent = '';
    const value = option(definition.key);
    if (input.hasAttribute('data-enabled')) {
      value.enabled = input.checked;
      if (definition.key === 'lanes') {
        if (!input.checked && draft.lanes.count > 0) lastLaneCount = draft.lanes.count;
        draft.lanes.count = input.checked ? lastLaneCount : 0;
      }
      refreshRow(definition);
    } else if (input.hasAttribute('data-default')) {
      const field = definition.field!;
      if (input.checked) {
        if (typeof value[field] === 'number') customValues.set(definition.key, value[field]);
        value[field] = null;
      } else value[field] = customValues.get(definition.key) ?? definition.fallback!;
      refreshRow(definition);
    } else if (input.dataset.field && input.validity.valid && input.value !== '') {
      value[input.dataset.field as Field] = input.valueAsNumber;
      if (definition.key === 'lanes') {
        draft.lanes.enabled = input.valueAsNumber > 0;
        if (input.valueAsNumber > 0) lastLaneCount = input.valueAsNumber;
      }
      // Preserve the caret while typing; other controls reflect the new quantity.
      const selection = input.value;
      refreshRow(definition); input.value = selection;
    }
  });
  form.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.hasAttribute('data-reset')) {
      draft = createMatchSettings(); customValues.clear(); lastLaneCount = 1; error.textContent = ''; render();
      form.querySelector<HTMLElement>('.settings-scroll')!.scrollTop = 0;
    } else if (button.dataset.step) {
      const input = button.closest('[data-setting]')!.querySelector<HTMLInputElement>(`input[data-field="${button.dataset.field}"]`)!;
      const old = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : Number(input.min);
      input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Math.round((old + Number(button.dataset.step) * Number(input.step)) * 10) / 10)));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const confirmed = readSettings();
    if (confirmed) { close(); onConfirm(confirmed); }
  });
  dialog.showModal();
  return close;
}

export function openMatchRulesDialog(rules: ModeRules, environment: Environment, selection: EnvironmentSettings): () => void {
  const { dialog, close } = mountDialog('이번 경기 설정', '양 진영에 공통 적용 · 재대전에도 유지됩니다.');
  const details = [
    ['맵', `${MAPS[environment.map].name} · ${selection.map === 'random' ? '무작위 선택' : '고정'}`],
    ['날씨', `${WEATHER[environment.weather].name} · ${selection.weather === 'random' ? '무작위 선택' : '고정'}`],
    ...matchRuleDetails(rules),
  ];
  dialog.insertAdjacentHTML('beforeend', `<div class="settings-scroll settings-readonly"><dl>${details.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></div><div class="settings-footer"><button type="button" class="button primary" data-close>확인</button></div>`);
  dialog.showModal();
  return close;
}
