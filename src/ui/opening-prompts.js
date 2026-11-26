import { openingUnitDirection } from '../engine/opening-prompts.js';

const NOTICE_DURATION_MS = 8_000;
const AUGMENT_NOTICE = '2-1 海克斯选择，正在识别选项。';

export function bindOpeningPrompts({ notice, message, review, dismiss, dialog, home, open, onMessage }) {
  const inline = dialog.querySelector('.opening-header');
  const prompted = new Set();
  let phase = 'early';
  let text = '';
  let activeUnit;
  let dismissal = false;
  let expired = false;
  let hasChoices = false;
  let timer;
  let lastInventory;

  function draw() {
    const anchor = dialog.open ? inline : home;
    if (notice.previousElementSibling !== anchor) anchor.after(notice);
    review.hidden = dialog.open;
    notice.hidden = dismissal || expired || !text;
    const visibleMessage = notice.hidden ? '' : text;
    if (message.textContent !== visibleMessage) {
      message.textContent = visibleMessage;
      onMessage(visibleMessage);
    }
  }

  function scheduleHide() {
    clearTimeout(timer);
    expired = false;
    timer = setTimeout(() => {
      if (notice.contains(document.activeElement)) {
        scheduleHide();
        return;
      }
      expired = true;
      draw();
    }, NOTICE_DURATION_MS);
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
      scheduleHide();
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
    hasChoices = false;
    text = AUGMENT_NOTICE;
    scheduleHide();
    draw();
  }

  function updateAugments(choices) {
    if (phase !== 'augments') return;
    text = choices.length
      ? `2-1 海克斯 · 已匹配 ${choices.length} 项，优先考虑「${choices[0].aug.name}」。`
      : AUGMENT_NOTICE;
    if (choices.length && !hasChoices && !dismissal) {
      hasChoices = true;
      scheduleHide();
    }
    draw();
  }

  function finish() {
    clearTimeout(timer);
    phase = 'finished';
    text = '';
    draw();
  }

  function reset() {
    clearTimeout(timer);
    phase = 'early';
    text = '';
    dismissal = false;
    expired = false;
    activeUnit = undefined;
    lastInventory = undefined;
    prompted.clear();
    draw();
  }

  review.onclick = open;
  dismiss.onclick = () => { clearTimeout(timer); dismissal = true; draw(); };
  dialog.addEventListener('close', draw);
  return { draw, updateInventory, beginAugments, updateAugments, finish, reset,
    start() { if (phase === 'finished') reset(); },
  };
}
