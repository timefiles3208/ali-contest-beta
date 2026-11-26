import { openingUnitDirection } from '../engine/opening-prompts.js';

export function bindOpeningPrompts({ notice, message, review, dismiss, dialog, home, open, onMessage }) {
  const inline = dialog.querySelector('.opening-header');
  const prompted = new Set();
  let phase = 'early';
  let text = '';
  let activeUnit;
  let dismissal = false;
  let lastInventory;

  function draw() {
    const anchor = dialog.open ? inline : home;
    if (notice.previousElementSibling !== anchor) anchor.after(notice);
    review.hidden = dialog.open;
    notice.hidden = dismissal || !text;
    const visibleMessage = notice.hidden ? '' : text;
    if (message.textContent !== visibleMessage) {
      message.textContent = visibleMessage;
      onMessage(visibleMessage);
    }
  }

  function updateInventory(context) {
    if (phase !== 'early' || !context?.comps.length) return;
    const inventory = JSON.stringify([[...context.selected], [...context.unitCopies], [...context.owned], [...context.ownedItems]]);
    if (inventory === lastInventory) return;
    lastInventory = inventory;
    const hint = openingUnitDirection(context, prompted);
    if (hint) {
      activeUnit = hint.unit.id;
      prompted.add(activeUnit);
      dismissal = false;
      text = `已持有${hint.unit.name}，可考虑「${hint.row.comp.name}」。`;
    } else if (activeUnit && !context.selected.has(activeUnit)) {
      text = '';
      activeUnit = undefined;
    }
    draw();
  }

  function beginAugments() {
    if (phase === 'augments') return;
    phase = 'augments';
    dismissal = false;
    text = '进入 2-1 海克斯选择。先查看阵容方向，核对本轮选项后再选。';
    draw();
  }

  function updateAugments(choices) {
    if (phase !== 'augments') return;
    text = choices.length
      ? `2-1 海克斯 · 已匹配 ${choices.length} 项，优先考虑「${choices[0].aug.name}」。`
      : '进入 2-1 海克斯选择。先查看阵容方向，核对本轮选项后再选。';
    draw();
  }

  function finish() {
    phase = 'finished';
    text = '';
    draw();
  }

  function reset() {
    phase = 'early';
    text = '';
    dismissal = false;
    activeUnit = undefined;
    lastInventory = undefined;
    prompted.clear();
    draw();
  }

  review.onclick = open;
  dismiss.onclick = () => { dismissal = true; draw(); };
  dialog.addEventListener('close', draw);
  return { draw, updateInventory, beginAugments, updateAugments, finish, reset,
    start() { if (phase === 'finished') reset(); },
  };
}
