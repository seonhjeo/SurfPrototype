import Phaser from 'phaser';
import type { MapId, Side } from './data.ts';
import type { BattleState } from './simulation.ts';

export const GAME_SIZE = { width: 360, height: 600 };
const SCALE = 30;
const OWN = 0x297b83;
const FOE = 0xd36057;
const GOLD = 0xefbd5a;
const UNIT_DISPLAY = {
  radius: 14,
  iconSize: 16,
  borderWidth: 2,
  borderColor: GOLD,
  healthBarWidth: 28,
  healthBarHeight: 3,
  healthBarGap: 5,
};
const PALETTES: Record<MapId, { grass: number; edge: number; path: number; detail: number }> = {
  forest: { grass: 0xb8cbb0, edge: 0x91ad89, path: 0xd4d2b5, detail: 0x72936d },
  desert: { grass: 0xe5c792, edge: 0xcda968, path: 0xf0d6a7, detail: 0xb78b50 },
  swamp: { grass: 0xa5b7a2, edge: 0x809b91, path: 0xc0c6ab, detail: 0x628d82 },
  road: { grass: 0xbdc4af, edge: 0xa0af91, path: 0xd5cdbb, detail: 0x8d947f },
};

/** Presentation only. Combat uses continuous world coordinates in Simulation. */
export class BattleScene extends Phaser.Scene {
  private terrain!: Phaser.GameObjects.Graphics;
  private ink!: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private usedLabels = new Set<string>();
  private paintedMap: MapId | null = null;
  private preview: { x: number; y: number; valid: boolean; icon: string } | null = null;

  constructor(private readState: () => BattleState | null, private readSide: () => Side) {
    super('battle');
  }

  create() {
    this.terrain = this.add.graphics();
    this.ink = this.add.graphics();
    this.events.once('shutdown', () => {
      this.labels.clear();
      this.paintedMap = null;
    });
  }

  screenToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.game.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const x = (clientX - rect.left) / rect.width * 12;
    const y = (clientY - rect.top) / rect.height * 20;
    return this.readSide() === 'enemy' ? { x: 12 - x, y: 20 - y } : { x, y };
  }

  setPreview(position: { x: number; y: number } | null, valid: boolean, icon = '+') {
    this.preview = position ? { ...position, valid, icon } : null;
  }

  private point(x: number, y: number) {
    return this.readSide() === 'enemy' ? { x: (12 - x) * SCALE, y: (20 - y) * SCALE } : { x: x * SCALE, y: y * SCALE };
  }

  private label(key: string, value: string, x: number, y: number, size: number, color = '#18353c', alpha = 1) {
    let text = this.labels.get(key);
    if (!text) {
      text = this.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: size, color, fontStyle: 'bold' }).setOrigin(0.5);
      this.labels.set(key, text);
    }
    text.setText(value).setPosition(x, y).setFontSize(size).setColor(color).setAlpha(alpha).setVisible(true);
    this.usedLabels.add(key);
  }

  private drawTerrain(map: MapId) {
    const p = PALETTES[map];
    const g = this.terrain.clear();
    g.fillStyle(p.edge).fillRect(0, 0, 360, 600);
    g.fillStyle(p.grass).fillRoundedRect(13, 0, 334, 600, 30);
    // Soft pathways are scenery, never cells or movement constraints.
    g.lineStyle(64, p.path, 0.65).lineBetween(180, 25, 180, 575);
    g.lineStyle(25, p.path, 0.5).lineBetween(10, 300, 350, 300);
    g.fillStyle(p.path, 0.4).fillEllipse(180, 300, 210, 90);
    g.lineStyle(1, 0xffffff, 0.28).strokeCircle(180, 300, 34);
    for (let i = 0; i < 55; i++) {
      const x = 20 + ((i * 73 + 17) % 320);
      const y = 65 + ((i * 97 + 11) % 470);
      if (Math.abs(x - 180) < 44 || Math.abs(y - 300) < 27) continue;
      if (map === 'swamp') g.fillStyle(p.detail, 0.18).fillEllipse(x, y, 18 + i % 14, 7 + i % 5);
      else if (map === 'desert') {
        g.lineStyle(1, p.detail, 0.28).lineBetween(x - 4, y, x + 6, y - 2);
      } else {
        g.lineStyle(1, p.detail, 0.45).lineBetween(x - 2, y + 2, x - 3, y - 3).lineBetween(x + 1, y + 2, x + 3, y - 2);
      }
    }
    g.lineStyle(1, 0xffffff, 0.38).lineBetween(17, 300, 343, 300);
    [7, 353].forEach((x) => {
      g.fillStyle(0x465b52, 0.75).fillCircle(x, 300, 10);
      g.fillStyle(GOLD).fillCircle(x, 300, 4);
    });
    this.paintedMap = map;
  }

  update(_time: number) {
    const state = this.readState();
    if (!state || !this.ink) return;
    if (state.map !== this.paintedMap) this.drawTerrain(state.map);
    const g = this.ink.clear();
    this.usedLabels.clear();
    const side = this.readSide();
    if (this.preview) {
      g.fillStyle(OWN, 0.1).fillRect(13, 300, 334, 300);
      g.lineStyle(2, OWN, 0.7).lineBetween(13, 300, 347, 300);
      this.label('deploy', '아군 소환 영역', 180, 326, 11, '#297b83');
    }
    for (const zone of state.zones) {
      const p = this.point(zone.x, zone.y);
      g.fillStyle(0x77ceeb, 0.3).fillCircle(p.x, p.y, zone.radius * SCALE);
      g.lineStyle(1.5, 0xdafaff, 0.8).strokeCircle(p.x, p.y, zone.radius * SCALE);
    }
    for (const fortSide of ['player', 'enemy'] as const) {
      const fort = state.forts[fortSide];
      const p = this.point(fort.x, fort.y);
      const color = fortSide === side ? OWN : FOE;
      g.fillStyle(0x263b38, 0.13).fillEllipse(p.x, p.y + 18, 70, 17);
      g.fillStyle(0x465453).fillRoundedRect(p.x - 27, p.y - 11, 54, 28, 3);
      g.fillStyle(0xe8e5d2).fillRoundedRect(p.x - 24, p.y - 15, 48, 28, 2);
      g.fillStyle(0xd0cebb).fillRect(p.x - 27, p.y - 22, 13, 37).fillRect(p.x + 14, p.y - 22, 13, 37);
      g.fillStyle(color).fillRect(p.x - 27, p.y - 22, 13, 6).fillRect(p.x + 14, p.y - 22, 13, 6);
      g.fillStyle(0x4a5b58).fillRoundedRect(p.x - 6, p.y - 1, 12, 15, { tl: 6, tr: 6, bl: 0, br: 0 });
      g.fillStyle(color).fillTriangle(p.x + 1, p.y - 17, p.x + 1, p.y - 32, p.x + 14, p.y - 25);
      g.lineStyle(1, 0x4a5b58).lineBetween(p.x, p.y - 33, p.x, p.y - 12);
      const barY = p.y < 300 ? p.y + 27 : p.y - 43;
      g.fillStyle(0x253a3d, 0.18).fillRoundedRect(p.x - 35, barY, 70, 5, 2);
      g.fillStyle(color).fillRoundedRect(p.x - 35, barY, 70 * Math.max(0, fort.hp / fort.maxHp), 5, 2);
      this.label(`fort-${fortSide}`, `${Math.max(0, Math.ceil(fort.hp))}`, p.x + 52, barY + 2, 10);
    }
    const ordered = [...state.units].sort((a, b) => this.point(a.x, a.y).y - this.point(b.x, b.y).y);
    for (const u of ordered) {
      if (u.hp <= 0) continue;
      const hidden = u.hiddenUntil > state.time;
      // Hidden enemies remain concealed; their area effects can still be observed.
      if (hidden && u.side !== side) continue;
      const p = this.point(u.x, u.y);
      const neutral = u.side === 'neutral';
      const fullDisplay = !neutral || u.boss;
      const radius = fullDisplay ? UNIT_DISPLAY.radius : 5.5;
      const color = neutral ? (u.boss ? 0x7954a0 : 0x9b753d) : u.side === side ? OWN : FOE;
      const alpha = hidden ? 0.42 : 1;
      g.fillStyle(0x1f3536, 0.17 * alpha).fillEllipse(p.x, p.y + radius * 0.7, radius * 2.1, radius * 0.85);
      g.fillStyle(color, alpha).fillCircle(p.x, p.y, radius);
      g.lineStyle(fullDisplay ? UNIT_DISPLAY.borderWidth : 1.5, fullDisplay ? UNIT_DISPLAY.borderColor : 0xf4f0db, alpha).strokeCircle(p.x, p.y, radius);
      if (fullDisplay) this.label(`unit-${u.id}`, u.icon, p.x, p.y - 0.2, UNIT_DISPLAY.iconSize, '#fff8df', alpha);
      if (u.buffUntil > state.time) g.lineStyle(1.5, GOLD, 0.8).strokeCircle(p.x, p.y, radius + 3);
      if (u.stunUntil > state.time) this.label(`stun-${u.id}`, '✦', p.x, p.y - radius - 8, 10, '#724da3');
      if (u.hp < u.maxHp || fullDisplay) {
        const width = fullDisplay ? UNIT_DISPLAY.healthBarWidth : 11;
        const barY = p.y - radius - UNIT_DISPLAY.healthBarGap;
        g.fillStyle(0x243334, 0.35).fillRect(p.x - width / 2, barY, width, UNIT_DISPLAY.healthBarHeight);
        g.fillStyle(neutral ? GOLD : color).fillRect(p.x - width / 2, barY, width * Math.max(0, u.hp / u.maxHp), UNIT_DISPLAY.healthBarHeight);
      }
    }
    for (const shot of state.projectiles) {
      const p = this.point(shot.x, shot.y);
      g.fillStyle(shot.side === side ? 0xf7d779 : 0xffa88d).fillCircle(p.x, p.y, 3);
      g.lineStyle(1, 0xffffff, 0.8).strokeCircle(p.x, p.y, 3);
    }
    for (const effect of state.effects) {
      const p = this.point(effect.x, effect.y);
      const life = Math.min(1, Math.max(0, (effect.expiresAt - state.time) / 0.4));
      g.lineStyle(2, effect.kind === 'skill' ? GOLD : 0xffffff, life).strokeCircle(p.x, p.y, 7 + (1 - life) * 13);
    }
    for (let i = 0; i < state.warnings.length; i++) {
      const warning = state.warnings[i];
      const p = this.point(warning.x, warning.y);
      const pulse = 18 + Math.sin(state.time * 9) * 3;
      g.fillStyle(0xa84642, 0.14).fillCircle(p.x, p.y, pulse + 6);
      g.lineStyle(2, 0xa84642, 0.8).strokeCircle(p.x, p.y, pulse);
      this.label(`warn-${i}`, `! ${Math.max(1, Math.ceil(warning.spawnAt - state.time))}`, p.x, p.y, 13, '#8a2b32');
    }
    if (state.weather === 'rain') {
      g.lineStyle(1, 0xe5f3f3, 0.3);
      for (let i = 0; i < 28; i++) {
        const x = (i * 79 + state.time * 22) % 360;
        const y = (i * 137 + state.time * 280) % 600;
        g.lineBetween(x, y, x - 3, y + 10);
      }
    } else if (state.weather === 'fog') {
      g.fillStyle(0xf4f5e8, 0.12).fillEllipse(105 + Math.sin(state.time * 0.12) * 60, 205, 480, 140);
      g.fillStyle(0xf4f5e8, 0.12).fillEllipse(265 - Math.sin(state.time * 0.1) * 70, 420, 450, 150);
    }
    if (this.preview) {
      const p = this.point(this.preview.x, this.preview.y);
      const color = this.preview.valid ? OWN : FOE;
      g.fillStyle(color, 0.2).fillCircle(p.x, p.y, UNIT_DISPLAY.radius);
      g.lineStyle(UNIT_DISPLAY.borderWidth, color, 0.9).strokeCircle(p.x, p.y, UNIT_DISPLAY.radius);
      this.label('preview', this.preview.icon, p.x, p.y - 0.2, UNIT_DISPLAY.iconSize, this.preview.valid ? '#297b83' : '#ba453f');
    }
    for (const [key, text] of this.labels) {
      if (!this.usedLabels.has(key)) {
        text.destroy();
        this.labels.delete(key);
      }
    }
  }
}
