import { openingUnitDirection } from '../engine/opening-prompts.js';
import { lineupSelectButton, recommendedLineups } from './lineup-list.js?v=opening-decision';

const NOTICE_DURATION_MS = 8_000;
const AUGMENT_NOTICE = '2-1 海克斯选择，正在识别选项。';

export function bindOpeningPrompts({ notice, message, lineups, review, dismiss, dialog, home, open, onMessage, ranked, onSelect, selectedId }) {
  const inline = dialog.querySelector('.opening-header');
  const prompted = new Set();
  let phase = 'early';
  let text = '';
  let activeUnit;
  let earlyComp;
  let dismissal = false;
  let expired = false;
  let choicesShown = 0;
  let timer;
  let lastInventory;
  let lineupKey;
  let equipmentAugment;

  function draw() {
    const anchor = dialog.open ? inline : home;
    if (notice.previousElementSibling !== anchor) anchor.after(notice);
    review.hidden = dialog.open || phase === 'equipment';
    notice.hidden = dismissal || expired || !text;
    const visibleMessage = notice.hidden ? '' : text;
    const choices = notice.hidden ? [] : phase === 'augments'
      ? recommendedLineups(ranked(), { allowUnmatched: true }).map(row => row.comp)
      : phase === 'early' && earlyComp ? [earlyComp] : [];
    const selected = selectedId();
    const nextKey = JSON.stringify([selected, choices.map(comp => [comp.id, comp.name])]);
    if (lineupKey !== nextKey) {
      lineupKey = nextKey;
      lineups.replaceChildren(...choices.map(comp => lineupSelectButton(comp, onSelect, selected, true)));
      lineups.hidden = !choices.length;
    }
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
      earlyComp = hint.row.comp;
      prompted.add(activeUnit);
      dismissal = false;
      text = `已持有${hint.unit.name}，可考虑「${hint.row.comp.name}」。`;
      scheduleHide();
    } else if (activeUnit && !context.selected.has(activeUnit)) {
      text = '';
      activeUnit = undefined;
      earlyComp = undefined;
    }
    draw();
  }

  function beginAugments() {
    if (phase === 'augments') return;
    phase = 'augments';
    dismissal = false;
    choicesShown = 0;
    text = AUGMENT_NOTICE;
    scheduleHide();
    draw();
  }

  function updateAugments(choices) {
    if (phase !== 'augments') return;
    const count = choices.length;
    text = count
      ? `2-1 海克斯 · ${count === 3 ? '已匹配 3 项' : `暂按已识别的 ${count} 项`}，优先考虑「${choices[0].aug.name}」。`
      : AUGMENT_NOTICE;
    if (count && (!choicesShown || count === 3 && choicesShown < 3) && !dismissal) {
      choicesShown = count;
      scheduleHide();
    }
    draw();
  }

  function finish() {
    clearTimeout(timer);
    phase = 'finished';
    text = '';
    equipmentAugment = undefined;
    draw();
  }

  function showEquipment(id, description) {
    phase = 'equipment';
    equipmentAugment = id;
    dismissal = false;
    text = description;
    scheduleHide();
    draw();
  }

  function reset() {
    clearTimeout(timer);
    phase = 'early';
    text = '';
    dismissal = false;
    expired = false;
    activeUnit = undefined;
    earlyComp = undefined;
    lastInventory = undefined;
    equipmentAugment = undefined;
    prompted.clear();
    draw();
  }

  review.onclick = open;
  dismiss.onclick = () => { clearTimeout(timer); dismissal = true; draw(); };
  dialog.addEventListener('close', draw);
  return { draw, updateInventory, beginAugments, updateAugments, finish, reset, showEquipment,
    clearEquipment(id) { if (phase === 'equipment' && equipmentAugment === id) finish(); },
    start() { if (phase === 'finished' || phase === 'equipment') reset(); },
  };
}
