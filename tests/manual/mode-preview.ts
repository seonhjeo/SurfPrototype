import { GAME_MODES, resolveModeRules } from '../../src/game/data';
import { SurfApp } from '../../src/ui';
import '../../src/style.css';
const requested = Number(new URLSearchParams(location.search).get('lanes') ?? 3);
const count = [0, 1, 2, 3].includes(requested) ? requested as 0 | 1 | 2 | 3 : 3;
GAME_MODES.standard.rules = resolveModeRules('standard', {
  lanes: { count }, minions: { enabled: true },
  fortAttacks: { catapult: { enabled: true }, oil: { enabled: true } },
  towers: { enabled: true }, spBox: { enabled: true, respawnDelay: 15 },
  sp: { initial: 40, maximum: 80 },
});
// This developer-only entry is not included in the production Vite build.
// Its browser-local preset cannot be used with an authoritative public PVP room.
const app = new SurfApp();
const restrictLobby = () => {
  for (const element of document.querySelectorAll<HTMLElement>('.private-heading, [data-action="create"], .join-form, #join-help')) element.style.display = 'none';
};
restrictLobby();
const observer = new MutationObserver(restrictLobby);
observer.observe(document.querySelector('#screen')!, { childList: true });
if (import.meta.hot) import.meta.hot.dispose(() => { observer.disconnect(); app.destroy(); });
