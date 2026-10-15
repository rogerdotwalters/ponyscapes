'use strict';
/* CLIENT - how the breeding genetics are shown (shared/ponyPedigree.js does the sums; the server sends a pony's small summary every snapshot, and its whole tree and a mating's report when asked).
 * One switch, "Show background genetics" (kept in this browser), is shared by the Pony Book and the stall's breeding box: OFF shows the plain rating (a grade and a word) and the parents;
 * ON shows what stands behind it (inbreeding coefficient, relationship, heterozygosity, common ancestors, the genes allele by allele, hidden recessives, herd diversity). */
const GeneticsView = (() => {
  const KEY = 'ponyscapes.showGenetics', listeners = [];
  let on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode: off */ }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sym = x => PonyLook.sexInfo(x).symbol;
  const chip = (grade, word, color, score) => `<span class="gchip" style="--c:${color}" title="Genetic diversity: ${score}/100">${esc(grade)} &middot; ${esc(word)}</span>`;
  const swatch = c => (c ? `<i class="gsw" style="background:${esc(c)}"></i>` : '');
  const row = (k, v) => `<div class="grow2"><span>${k}</span><b>${v}</b></div>`;
  return {
    get on() { return on; },
    set(v) { on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ } for (const f of listeners) f(on); },
    onChange(f) { listeners.push(f); },
    /** The switch itself (a checkbox with the id gtog; the owner of the panel listens for its change). */
    toggleHtml() { return `<label class="gtoggle" title="Show the numbers behind the diversity rating: inbreeding, kinship, heterozygosity and the genes themselves"><input type="checkbox" class="gtog"${on ? ' checked' : ''}> Show background genetics</label>`; },
    chip,

    /** What a pony's card in the Pony Book adds: the parents, the rating chip, and (switch on) the numbers and its genes. */
    cardHtml(pet) {
      if (!pet.look || !pet.gen) return '';
      const s = pet.gen, parents = s.sire || s.dam ? `Sire ${esc(s.sire || 'unknown')} &middot; Dam ${esc(s.dam || 'unknown')}` : 'Founder: caught or bought, no known parents';
      let html = `<div class="gline">${chip(s.g, s.w, s.c, s.s)} <small>${parents}</small> <button class="gtree" data-id="${esc(pet.id)}">Family tree</button></div>`;
      if (on) {
        html += `<div class="gnums"><span title="Inbreeding coefficient: the chance its two copies of a gene come from one ancestor">Inbreeding ${s.f}%</span><span title="Share of its genes holding two different alleles">Heterozygous ${s.h}%</span>` +
          `<span title="Generations of ancestors on record">${s.gens} generation${s.gens === 1 ? '' : 's'} known</span><span>Diversity ${s.s}/100</span></div>${GeneticsView.genomeHtml(pet.look)}`;
      }
      return html;
    },
    /** The genome allele by allele: the one that shows and the one it carries. */
    genomeHtml(look) {
      const rows = Pedigree.genomeRows(look).map(r => `<tr class="${r.het ? 'het' : 'hom'}"><td>${esc(r.gene)}</td><td>${swatch(r.shown.color)}${esc(r.shown.name)}</td>` +
        `<td>${r.hidden ? `<span class="gcarry">${swatch(r.hidden.color)}${esc(r.hidden.name)}${r.hidden.recessive ? ' (recessive)' : ''}</span>` : '<span class="gsame">same</span>'}</td></tr>`).join('');
      return `<details class="ggenome"><summary>Genes, allele by allele</summary><table><thead><tr><th>Gene</th><th>Shows</th><th>Carries</th></tr></thead><tbody>${rows}</tbody></table>` +
        `<small>The lower allele is dominant and shows; the other is carried, and two carriers can have a foal that shows it.</small></details>`;
    },

    /** The breeding box's rating of a mating (the server's pair view). */
    pairHtml(pair) {
      if (!pair) return '';
      let html = `<div class="gpair">${chip(pair.grade, pair.word, pair.color, pair.score)} <small>${esc(pair.band)}: ${esc(pair.note)}</small></div>`;
      if (pair.tooClose) html += `<p class="stHint gwarn">These two are very close kin: a foal would be about ${pair.f}% inbred.</p>`;
      if (on) {
        html += `<div class="gdetail">${row('Foal inbreeding (COI)', pair.f + '%')}${row('Parents related by', pair.rel + '%')}${row('Expected heterozygosity', pair.het + '%')}${row('Diversity score', pair.score + '/100')}` +
          `${row('Pedigree known', pair.depth + ' generation' + (pair.depth === 1 ? '' : 's'))}`;
        html += pair.common.length ? `<div class="grow2 wide"><span>Common ancestors</span><b>${pair.common.map(c => `${sym(c.sex)} ${esc(c.name)} (${c.up[0]} up the sire's side, ${c.up[1]} the dam's)`).join('; ')}</b></div>` : '<div class="grow2 wide"><span>Common ancestors</span><b>none on record</b></div>';
        html += pair.shared.length ? `<div class="grow2 wide"><span>Hidden in both</span><b>${pair.shared.map(s => `${swatch(s.color)}${esc(s.gene)}: ${esc(s.allele)} (${s.chance}% of foals)`).join('; ')}</b></div>` : '';
        html += '</div>';
      }
      return html;
    },

    /** What a mating could make besides a copy of a parent (the server's `cross`): hybrid varieties and new kinds of pony, with their chances. Always shown: it is a breeding option, not background. */
    crossHtml(cross) {
      if (!cross) return '';
      const hy = cross.hybrids.map(h => `<span class="gchip" style="--c:${esc(h.color)}" title="${esc(h.rarity)}">${esc(h.name)} pony &middot; ${h.chance}%</span>`).join(' ');
      const ki = cross.kinds.map(k => `<span class="gkid">${esc(k.name)} &middot; ${k.chance}%</span>`).join(' ');
      const dot = c => `<i class="gsw big" style="background:${esc(c)}"></i>`;
      const co = (cross.colors || []).map(c => `<div class="gcolor ${esc(c.rule)}">${dot(c.a.color)}<span>${esc(c.a.name)}</span> + ${dot(c.b.color)}<span>${esc(c.b.name)}</span>` +
        (c.result ? ` &rarr; ${dot(c.result.color)}<b>${esc(c.result.name)}</b>` : '') + `<small>${esc(c.part)}: ${esc(c.text)}</small></div>`).join('');
      if (!hy && !ki && !co) return '';
      return `<div class="gcross">${co ? `<div><small>Colours</small></div>${co}` : ''}${hy ? `<div><small>${esc(cross.from[0])} x ${esc(cross.from[1])} can make a hybrid</small></div><div class="gline">${hy}</div>` : ''}${ki ? `<div><small>Foals may also be a new kind of pony</small></div><div class="gline">${ki}</div>` : ''}</div>`;
    },

    /** One pedigree chart: the pony on the left, its parents to the right, theirs further right. Ancestors met more than once (inbreeding) are ringed in gold. */
    treeHtml(tree) {
      const seen = new Map(), count = n => { if (!n) return; seen.set(n[0], (seen.get(n[0]) || 0) + 1); count(n[3]); count(n[4]); };
      count(tree);
      const box = (n, role) => `<div class="pnode ${n[2] === 'f' ? 'f' : 'm'}${seen.get(n[0]) > 1 ? ' dup' : ''}" title="${esc(n[1])}${seen.get(n[0]) > 1 ? ' (appears more than once: inbreeding)' : ''}"><small>${role}</small>${sym(n[2])} ${esc(n[1])}</div>`;
      const unknown = role => `<div class="pnode unk"><small>${role}</small>unknown</div>`;
      const go = (n, role, depth) => {
        if (!n) return `<div class="prow">${unknown(role)}</div>`;
        const kids = depth < Pedigree.DEPTH && (n[3] || n[4]) ? `<div class="pcol">${go(n[3], 'sire', depth + 1)}${go(n[4], 'dam', depth + 1)}</div>` : '';
        return `<div class="prow">${box(n, role)}${kids}</div>`;
      };
      return `<div class="ptreewrap"><div class="ptree">${go(tree, 'this pony', 0)}</div></div>`;
    },

    /** The family-tree view (the server's 'lineage' event). */
    lineageHtml(e) {
      let html = `<div class="gback"><button class="gbackbtn">&larr; Back to the Pony Book</button></div><div class="gtitle">${sym(e.sex)} ${esc(e.name)} <small>family tree</small></div>`;
      html += `<div class="gline">${chip(e.grade, e.word, e.color, e.score)} <small>${esc(e.band)}: ${esc(e.note)}</small></div>`;
      html += GeneticsView.treeHtml(e.tree);
      html += e.founder ? '<p class="stHint">A founder: caught wild or bought, so nothing is known of its parents (and it is treated as unrelated to every other pony).</p>'
        : `<p class="stHint">${e.known} ancestor${e.known === 1 ? '' : 's'} on record, ${e.gens} generation${e.gens === 1 ? '' : 's'} deep. Gold-ringed names appear more than once in the tree.</p>`;
      if (e.common && e.common.length) html += `<p class="stHint">Its parents share ${e.common.map(c => `${sym(c.sex)} ${esc(c.name)}`).join(', ')}.</p>`;
      html += '<div class="gtitle">Offspring you keep</div>' + (e.kids.length ? `<div class="gkids">${e.kids.map(k => `<span class="gkid ${k.sex}">${sym(k.sex)} ${esc(k.name)} <small>${k.up === 1 ? 'foal' : k.up === 2 ? 'grandfoal' : k.up + ' generations down'}</small></span>`).join('')}</div>` : '<p class="stHint">None yet.</p>');
      if (on) {
        html += '<div class="gtitle">Background genetics</div><div class="gdetail">' + row('Inbreeding coefficient (F)', e.f + '%') + row('Its parents are related by', e.rel + '%') + row('Heterozygous loci', e.het + '%') + row('Diversity score', e.score + '/100') +
          row('Ancestors on record', e.known) + '</div>';
      }
      return html;
    },

    /** The herd card at the top of the Pony Book (switch on). */
    herdHtml(h) {
      if (!h) return '';
      return `<div class="gherd"><div class="gtitle">Your herd's diversity ${chip(h.grade, h.word, h.color, h.score)}</div><div class="gdetail">` +
        row('Ponies', h.n) + row('Mean kinship', h.mk + '%') + row('Effective population (Ne)', h.ne) + row('Founders / effective founders', h.founders + ' / ' + h.fe) +
        row('Alleles per gene', h.rich) + row('Heterozygosity (seen / expected)', h.ho + '% / ' + h.he + '%') + row('Inbreeding (F_IS)', h.fis + '%') + row('Average pony inbreeding', h.meanF + '%') +
        `</div><small>Mean kinship is the chance two ponies picked from the herd share a gene by descent; the lower it is, the more diverse the herd. Effective population is the size of an unrelated herd that would drift as fast.</small></div>`;
    }
  };
})();
