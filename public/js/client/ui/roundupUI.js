'use strict';
/* CLIENT - the Round-Up's scoreboard (roundupSystem.js): the two sides and their sheep, the clock, the countdown and GO, a hint for the first few seconds, and the result
 * when the round is over. Everything it shows comes from game.roundup (the server's stateFor); it only draws. */
class RoundupUI {
  constructor({ game }) {
    this.game = game; this.shown = ''; this.prize = null;
    const el = this.root = document.createElement('div');
    el.id = 'roundupHud'; el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="ruBoard"><div class="ruTeam t0"><b></b><i></i><span></span></div><div class="ruClock"></div><div class="ruTeam t1"><b></b><i></i><span></span></div></div>'
      + '<div class="ruBig"></div><div class="ruHint"></div>'
      + '<div class="ruResult"><h2></h2><div class="ruScore"></div><div class="ruPrize"></div></div>';
    document.body.appendChild(el);
    const q = s => el.querySelector(s);
    this.team = [q('.t0'), q('.t1')]; this.clock = q('.ruClock'); this.big = q('.ruBig'); this.hint = q('.ruHint'); this.result = q('.ruResult');
    const inv = this.invite = document.createElement('div');                                                              // the invitation: Join / No thanks
    inv.id = 'roundupInvite'; inv.innerHTML = '<div class="riText"></div><div class="riBtns"><button class="riYes">Join</button><button class="riNo">No thanks</button></div><div class="riBar"><i></i></div>';
    document.body.appendChild(inv);
    const answer = yes => { inv.classList.remove('on'); clearInterval(this.inviteTimer); game.roundupJoin(yes); };
    inv.querySelector('.riYes').onclick = () => answer(true); inv.querySelector('.riNo').onclick = () => answer(false);
    game.events.on('roundupInvite', e => {
      inv.querySelector('.riText').textContent = `${e.from} is starting a Round-Up at the old fence. Join?`; inv.classList.add('on');
      const t0 = performance.now(), bar = inv.querySelector('.riBar i'); clearInterval(this.inviteTimer);
      this.inviteTimer = setInterval(() => { bar.style.width = Math.max(0, 100 - (performance.now() - t0) / (e.seconds * 10)) + '%'; }, 100);
    });
    game.events.on('roundupInviteEnd', () => { inv.classList.remove('on'); clearInterval(this.inviteTimer); });
    game.events.on('roundupEnd', e => { this.prize = e; });
    game.events.on('roundupLeft', () => { this.prize = null; });
  }

  update() {
    const ru = this.game.roundup, play = RoundupRules.seconds.play;
    if (!ru) { if (this.shown) { this.shown = ''; this.root.classList.remove('on', 'over'); this.prize = null; } return; }
    const secs = Math.max(0, Math.ceil(ru.t)), left = ru.ph === 'play' ? secs : ru.ph === 'countdown' ? play : 0;
    const big = ru.ph === 'countdown' ? (ru.t > RoundupRules.seconds.countdown - 1 ? 'Get ready!' : String(Math.max(1, Math.ceil(ru.t)))) : ru.ph === 'play' && ru.t > play - 1.2 ? 'GO!' : '';
    const showHint = ru.ph === 'countdown' || (ru.ph === 'play' && ru.t > play - 16);
    const key = [ru.ph, left, big, showHint ? 1 : 0, ru.teams.map(t => t.s).join('-'), ru.you, this.prize ? 1 : 0, (ru.steals || []).length].join('|');
    if (key === this.shown) return;
    this.shown = key;
    this.root.classList.add('on'); this.root.classList.toggle('over', ru.ph === 'over');
    ru.teams.forEach((t, i) => {
      const el = this.team[i];
      el.style.setProperty('--c', t.c); el.classList.toggle('me', i === ru.you);
      el.querySelector('b').textContent = t.n + (i === ru.you ? ' (you)' : '');
      el.querySelector('i').textContent = '\u{1F411}';
      el.querySelector('span').textContent = String(t.s);
      el.title = t.w.join(', ');
    });
    this.clock.textContent = ru.ph === 'over' ? 'Time!' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    this.big.textContent = big; this.big.classList.toggle('on', !!big);
    this.hint.textContent = 'Lasso a sheep (L, right click or the lasso button) and stay close till it calms. Lead it to your pole and press Use. Cross a rival’s rope to cut it.';
    this.hint.classList.toggle('on', showHint);
    if (ru.ph === 'over' && ru.res) {
      const r = ru.res, mine = ru.you, won = r.winner === mine;
      this.result.querySelector('h2').textContent = r.winner < 0 ? 'A draw!' : `${ru.teams[r.winner].n} wins!`;
      this.result.querySelector('h2').style.color = r.winner < 0 ? '#f2e6cf' : ru.teams[r.winner].c;
      this.result.querySelector('.ruScore').textContent = `${r.scores[0]} – ${r.scores[1]}`;
      const p = this.prize;
      this.result.querySelector('.ruPrize').textContent = p ? `${won ? 'Well roped! ' : ''}You earn ${p.wool} wool${p.coins ? ' and ' + p.coins + ' coins' : ''}` : '';
    }
  }
}
