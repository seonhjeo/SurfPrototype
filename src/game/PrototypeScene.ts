import Phaser from 'phaser';

export const GAME_SIZE = { width: 960, height: 540 };
const SPEED = 280;
const RADIUS = 18;

export class PrototypeScene extends Phaser.Scene {
  private marker!: Phaser.GameObjects.Arc;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private direction = new Phaser.Math.Vector2();

  constructor() {
    super('prototype');
  }

  create() {
    const grid = this.add.graphics().lineStyle(1, 0x24434b, 0.65);
    for (let x = 0; x <= GAME_SIZE.width; x += 60) {
      grid.lineBetween(x, 0, x, GAME_SIZE.height);
    }
    for (let y = 0; y <= GAME_SIZE.height; y += 60) {
      grid.lineBetween(0, y, GAME_SIZE.width, y);
    }

    this.add.circle(GAME_SIZE.width / 2, GAME_SIZE.height / 2, 70)
      .setStrokeStyle(1, 0x537078);
    this.marker = this.add.circle(0, 0, RADIUS, 0xd9ee91);
    this.resetPosition();

    this.keys = this.input.keyboard?.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT', false,
    ) as Record<string, Phaser.Input.Keyboard.Key> | undefined;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      document.querySelector<HTMLElement>('#game')?.focus({ preventScroll: true });
      this.marker.setPosition(
        Phaser.Math.Clamp(pointer.x, RADIUS, GAME_SIZE.width - RADIUS),
        Phaser.Math.Clamp(pointer.y, RADIUS, GAME_SIZE.height - RADIUS),
      );
    });

    const status = document.querySelector('#status');
    if (status) status.textContent = '플레이 준비 완료';
  }

  resetPosition() {
    this.marker?.setPosition(GAME_SIZE.width / 2, GAME_SIZE.height / 2);
  }

  update(_time: number, delta: number) {
    if (!this.keys || document.activeElement?.id !== 'game') return;

    const down = (name: string) => this.keys?.[name]?.isDown ? 1 : 0;
    this.direction.set(
      Math.max(down('RIGHT'), down('D')) - Math.max(down('LEFT'), down('A')),
      Math.max(down('DOWN'), down('S')) - Math.max(down('UP'), down('W')),
    ).normalize();
    const distance = SPEED * Math.min(delta, 50) / 1000;
    this.marker.x = Phaser.Math.Clamp(this.marker.x + this.direction.x * distance, RADIUS, GAME_SIZE.width - RADIUS);
    this.marker.y = Phaser.Math.Clamp(this.marker.y + this.direction.y * distance, RADIUS, GAME_SIZE.height - RADIUS);
  }
}
