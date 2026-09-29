import Phaser from 'phaser';
import { GAME_SIZE, PrototypeScene } from './game/PrototypeScene';
import './style.css';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#102c35',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    ...GAME_SIZE,
  },
  scene: [PrototypeScene],
});

const reset = () => {
  const scene = game.scene.getScene('prototype') as PrototypeScene | null;
  scene?.resetPosition();
};

const preventScroll = (event: KeyboardEvent) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
  }
};

const resetButton = document.querySelector('#reset');
const gameContainer = document.querySelector<HTMLDivElement>('#game');
resetButton?.addEventListener('click', reset);
gameContainer?.addEventListener('keydown', preventScroll);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    resetButton?.removeEventListener('click', reset);
    gameContainer?.removeEventListener('keydown', preventScroll);
    game.destroy(true);
  });
}
