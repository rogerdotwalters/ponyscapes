'use strict';
/* CLIENT - one inventory slot element (shared by the toolbar and the inventory panel). */
const SlotView = {
  create(index, hotkeyLabel) {
    const el = document.createElement('div');
    el.className = 'slot'; el.dataset.index = index;
    el.innerHTML = `<span class="num">${hotkeyLabel || ''}</span><img alt="" hidden><span class="qty"></span>`;
    return el;
  },
  fill(el, slot) {
    const img = el.querySelector('img'), qty = el.querySelector('.qty');
    img.hidden = !slot;
    if (slot) img.src = ItemIcons.url(slot.id);
    const rarity = slot ? ItemDB.rarity(slot.id) : null;                     // uncommon and better items wear their rarity's colour
    el.style.setProperty('--rarity', rarity && rarity.order ? rarity.color : 'transparent');
    el.classList.toggle('rare', !!(rarity && rarity.order));
    el.title = slot ? `${ItemDefs[slot.id] ? ItemDefs[slot.id].name : slot.id}${rarity && rarity.order ? ' (' + rarity.name + ')' : ''}` : '';
    qty.textContent = slot && slot.count > 1 ? slot.count : '';
  },
  onPress(el, handler) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); handler(); });
  }
};
