import { createMatchSettings, MATCH_SETTING_DEFINITIONS, validateMatchSettings } from './game/match-settings';
import type { MatchSettingDefinition, MatchSettings } from './game/match-settings';
import type { ModeRules } from './game/data';
import { matchRuleDetails } from './game/mode-description';

type Option = { enabled: boolean; amount?: number | null; count?: number | null; laneCount?: number };
type Field = 'amount' | 'count' | 'laneCount';
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function mountDialog(title: string, subtitle: string) {
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
  return { dialog, close };
}

export function openMatchSettingsDialog(settings: MatchSettings, destination: 'ai' | 'room', onConfirm: (settings: MatchSettings) => void): () => void {
  const { dialog, close } = mountDialog('경기를 설정하세요', `${destination === 'ai' ? 'AI와 대전' : '비공개 방 만들기'} · 설정을 마치면 덱을 준비합니다.`);
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
  const render = () => {
    const groups = [...new Set(MATCH_SETTING_DEFINITIONS.map((definition) => definition.section))];
    sections.innerHTML = groups.map((group) => `<section class="settings-group"><h3>${group}</h3>${MATCH_SETTING_DEFINITIONS.filter((definition) => definition.section === group).map((definition) => `<div class="setting-row" data-setting="${definition.key}"><div class="setting-heading"><div><h4>${definition.label}</h4><p id="help-${definition.key}">${definition.help}</p></div><label class="setting-switch"><input type="checkbox" role="switch" data-enabled aria-label="${definition.label} 사용" aria-describedby="help-${definition.key}"><span class="switch-track" aria-hidden="true"></span><span data-toggle-label aria-hidden="true"></span></label></div>${definition.defaultLabel ? `<label class="setting-default"><input type="checkbox" data-default>${definition.defaultLabel}</label>` : ''}${definition.extra ? numberControl(definition, definition.extra.field, definition.extra.label, definition.extra.min, definition.extra.max, definition.extra.step, definition.extra.unit) : ''}${definition.field ? numberControl(definition, definition.field, definition.key === 'towers' ? '라인당 포탑 수' : `${definition.label} ${definition.field === 'count' ? '수량' : '획득량'}`, definition.min!, definition.max!, definition.step!, definition.unit!) : ''}</div>`).join('')}</section>`).join('');
    MATCH_SETTING_DEFINITIONS.forEach(refreshRow);
  };
  render();
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
    if (!form.reportValidity()) return;
    try {
      const confirmed = validateMatchSettings(draft);
      close(); onConfirm(confirmed);
    } catch (reason) { error.textContent = reason instanceof Error ? reason.message : '설정을 확인해 주세요.'; }
  });
  dialog.showModal();
  return close;
}

export function openMatchRulesDialog(rules: ModeRules): () => void {
  const { dialog, close } = mountDialog('이번 경기 설정', '양 진영에 공통 적용 · 재대전에도 유지됩니다.');
  dialog.insertAdjacentHTML('beforeend', `<div class="settings-scroll settings-readonly"><dl>${matchRuleDetails(rules).map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></div><div class="settings-footer"><button type="button" class="button primary" data-close>확인</button></div>`);
  dialog.showModal();
  return close;
}
