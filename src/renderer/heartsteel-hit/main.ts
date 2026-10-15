import { HeartsteelStage } from '../overlay/heartsteelStage';

const stage = new HeartsteelStage(
  document.getElementById('heartsteel') as HTMLElement,
  (id, x, y) => window.overlay.reportHeartsteelClaim(id, x, y),
  { play: () => undefined },
);

window.overlay.on('heartsteel:target', (target) => stage.showTarget(target));
window.overlay.on('heartsteel:clear', (target) => stage.clear(target?.id));
