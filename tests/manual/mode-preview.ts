import { createMatchSettings } from '../../src/game/match-settings';
import { SurfApp } from '../../src/ui';
import '../../src/style.css';

const requested = Number(new URLSearchParams(location.search).get('lanes') ?? 3);
const count = [0, 1, 2, 3].includes(requested) ? requested : 3;
const settings = createMatchSettings();
Object.assign(settings, {
  lanes: { enabled: count > 0, count }, minions: { enabled: true, count: 3 },
  catapult: { enabled: true }, oil: { enabled: true },
  towers: { enabled: true, count: 3, laneCount: 3 }, spBox: { enabled: true, count: 3 },
  startingSp: { enabled: true, amount: 40 },
});
// This developer-only entry is not included in the production Vite build.
// Populate the real settings form so the public confirmation path is exercised.
const app = new SurfApp();
const restrictLobby = () => {
  for (const element of document.querySelectorAll<HTMLElement>('.private-heading, [data-action="create"], .join-form, #join-help')) element.style.display = 'none';
};
restrictLobby();
const observer = new MutationObserver(restrictLobby);
observer.observe(document.querySelector('#screen')!, { childList: true });
document.querySelector<HTMLButtonElement>('[data-action="ai"]')!.click();
for (const [key, option] of Object.entries(settings)) {
  const row = document.querySelector<HTMLElement>(`[data-setting="${key}"]`)!;
  const toggle = row.querySelector<HTMLInputElement>('[data-enabled]')!;
  toggle.checked = option.enabled;
  toggle.dispatchEvent(new Event('input', { bubbles: true }));
  for (const [field, value] of Object.entries(option)) {
    if (field === 'enabled' || value === null) continue;
    const input = row.querySelector<HTMLInputElement>(`input[data-field="${field}"]`)!;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
if (import.meta.hot) import.meta.hot.dispose(() => { observer.disconnect(); app.destroy(); });
