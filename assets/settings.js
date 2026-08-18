/* 问题设定对照图：五张小图共用一个时钟，用同一批真实样本演五种设定。
   每拍分两段——训练（样本到来、标签空间更新）与推理（判别范围就位）；
   五种设定只在这两段上取不同规则，解释由图形承担，不写说明文字。 */

(() => {
  const root = document.querySelector('[data-setg]');
  if (!root) return;

  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const N = 3;                                     // 时间步 t₁ t₂ t₃
  const SUB = ['₁', '₂', '₃'];
  // 标签空间：三个任务各带两个类，与首屏同一条故事线
  const CLS = [
    ['cat', '猫'], ['dog', '狗'],
    ['car', '汽车'], ['plane', '飞机'],
    ['apple', '苹果'], ['banana', '香蕉'],
  ];
  const CROP = ['50% 46%', '36% 58%', '64% 38%'];  // 同一类的不同裁切 = 不同样本
  // 域增量：同样的类换一个域——实拍 → 素描 → 绘画，整批样本一起变
  const DOM = ['none', 'grayscale(1) contrast(1.7) brightness(1.14)',
               'sepia(.85) saturate(1.7) contrast(.92) blur(.35px)'];
  const TUNE = ['ScienceQA', 'TextVQA', 'OCRVQA'];
  const GEN = [100, 96, 93];                       // 细条高度：通用能力相对基座逐阶段回落，不作数值读数
  const PAIR = (q) => `只判 {${CLS[2 * q][1]}, ${CLS[2 * q + 1][1]}}`;
  const TQ = [0, 1, 0];                            // 身份给定：设问可以回到任一旧任务

  const pair = (k) => [2 * k, 2 * k + 1];
  const all = () => [0, 1, 2, 3, 4, 5];
  // 每拍两个新类：第 c 类在第 c>>1 拍出现，之后每过一拍旧一档
  const grow = (k, c) => (c <= 2 * k + 1 ? k - (c >> 1) : -1);

  const SETS = {
    task: {
      arrive: pair,
      cells: grow,
      frame: (k) => [2 * TQ[k], 2],
      ask: (k) => ({ kind: 'given', id: 't' + SUB[TQ[k]], scope: PAIR(TQ[k]) }),
    },
    data: {
      arrive: all,                                 // 同分布的新一批，覆盖同样的类
      cells: () => 0,
      frame: () => [0, 6],
      ask: () => ({ kind: 'na', id: '—', scope: '判全部类别' }),
    },
    class: {
      arrive: pair,                                // 与任务增量同一条训练流
      cells: grow,
      frame: (k) => [0, 2 * k + 2],
      ask: () => ({ kind: 'infer', id: '?', scope: '判已见类别' }),
    },
    domain: {
      arrive: all,
      cells: () => 0,                              // 标签空间不变，且始终在用
      dom: true,
      frame: () => [0, 6],
      ask: () => ({ kind: 'na', id: '—', scope: '判同样的类别' }),
    },
    tune: {
      arrive: (k) => [k],
      cells: (k, c) => (c <= k ? k - c : -1),
      frame: () => [0, 3],
      ask: (k) => ({ kind: 'na', id: '—', scope: '任意指令 · 通用能力保持' }),
    },
  };

  const KIND = { given: 'idm--given', infer: 'idm--infer', na: 'idm--na' };

  const shot = (c) =>
    `<img src="${BASE}assets/img/samples/${CLS[c][0]}.jpg" alt="" width="60" height="60"` +
    ` loading="lazy" decoding="async">`;

  // 图形部分全部由脚本搭：上排样本、下排标签空间、判别范围方框
  const build = (viz, key) => {
    const g = key === 'tune' ? 3 : 6;
    const slots = key === 'tune'
      ? TUNE.map((t) => `<i><em>${t}</em></i>`).join('')
      : CLS.map((_, c) => `<i>${shot(c)}</i>`).join('');
    const cells = key === 'tune'
      ? TUNE.map(() => '<b><i class="hb"></i></b>').join('')
      : CLS.map((_, c) => `<b>${shot(c)}<i class="hb"></i></b>`).join('');
    viz.style.setProperty('--g', g);
    viz.innerHTML =
      `<div class="setg-slots" data-slots>${slots}</div>
       <div class="setg-track">
         <div class="setg-cells${key === 'tune' ? ' is-ab' : ''}" data-cells>${cells}</div>
         ${key === 'tune' ? '<div class="setg-gen"><i data-gen style="--w:100%"></i></div>' : ''}
         <i class="setg-frame" data-frame style="--a:0;--n:${g}"></i>
       </div>`;
  };

  const grid = root.querySelector('[data-grid]');
  const beats = [...root.querySelectorAll('[data-beat]')];
  const phase = root.querySelector('[data-phase]');
  const cards = [...root.querySelectorAll('[data-set]')]
    .filter((el) => SETS[el.dataset.set] && el.querySelector('[data-viz]'))
    .map((el) => {
      const viz = el.querySelector('[data-viz]');
      build(viz, el.dataset.set);
      return {
        set: SETS[el.dataset.set],
        slots: [...viz.querySelectorAll('[data-slots] i')],
        cells: [...viz.querySelectorAll('[data-cells] b')],
        frame: viz.querySelector('[data-frame]'),
        idm: el.querySelector('[data-id]'),
        scope: el.querySelector('[data-scope]'),
        gen: viz.querySelector('[data-gen]'),
      };
    });
  if (!grid || !phase || !cards.length) return;

  // 训练段：本拍的样本到来（旧批留成灰影，表示不再可用），标签空间随之更新
  const train = (k) => {
    const pops = [];
    cards.forEach((c) => {
      const now = c.set.arrive(k);
      const seen = new Set();
      for (let j = 0; j <= k; j++) c.set.arrive(j).forEach((i) => seen.add(i));
      c.slots.forEach((el, i) => {
        const on = now.includes(i);
        el.className = on ? 'is-on' : seen.has(i) ? 'was' : '';
        const img = el.querySelector('img');
        if (img && on) {
          img.style.objectPosition = CROP[k];
          img.style.filter = c.set.dom ? DOM[k] : '';
        }
        if (on) pops.push(el);
      });
      c.cells.forEach((el, i) => {
        const d = c.set.cells(k, i);
        el.className = d < 0 ? 'hx' : 'a' + Math.min(2, d);
        if (d === 0) pops.push(el);
      });
      if (c.gen) c.gen.style.setProperty('--w', GEN[k] + '%');
    });
    void grid.offsetWidth;                         // 先落定再加动画类，重复的一拍也能重放
    pops.forEach((el) => el.classList.add('nw'));
  };

  // 推理段：判别范围就位，框外压暗；设问跟着框走
  const ask = (k) => cards.forEach((c) => {
    const [a, n] = c.set.frame(k);
    c.frame.style.setProperty('--a', a);
    c.frame.style.setProperty('--n', n);
    c.frame.classList.add('is-on');
    c.cells.forEach((el, i) => {
      if (!el.classList.contains('hx')) el.classList.toggle('mu', i < a || i >= a + n);
    });
    const q = c.set.ask(k);
    c.idm.textContent = q.id;
    c.idm.className = 'idm ' + KIND[q.kind];
    c.scope.textContent = q.scope;
  });

  const clear = () => cards.forEach((c) => {
    c.frame.classList.remove('is-on');
    c.cells.forEach((el) => el.classList.remove('mu'));
  });

  const mark = (k) => beats.forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)));
  const say = (html) => { phase.innerHTML = html; };

  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const stop = () => { timers.forEach(clearTimeout); timers = []; };

  const beat = (k) => {
    train(k);
    mark(k);
    say(`训练 <b>t${SUB[k]}</b>`);
    later(() => { ask(k); say('推理 · 在已见任务上判别'); }, 900);
    later(() => (k + 1 < N ? beat(k + 1) : end()), 2000);
  };

  // 收束：定在序列末，淡出后归零再开下一轮
  const end = () => {
    say('序列末 · 已见全部');
    later(() => grid.classList.add('is-rw'), 1600);
    later(() => {
      clear();
      grid.classList.remove('is-rw');
      beat(0);
    }, 1940);
  };

  const play = () => { stop(); clear(); beat(0); };
  const show = (k) => {
    train(k);
    ask(k);
    mark(k);
    say(k === N - 1 ? '序列末 · 已见全部' : `t${SUB[k]} 之后 · 推理`);
  };

  // 点某一拍即定格在该拍，之后不再自动推进
  let manual = false;
  beats.forEach((b, i) => b.addEventListener('click', () => {
    manual = true;
    stop();
    show(i);
  }));

  if (REDUCED) { show(N - 1); return; }

  clear();
  train(0);
  mark(0);
  say('训练 <b>t₁</b>');

  // 只在可见时跑，滚出视口即停
  const io = new IntersectionObserver(([entry]) => {
    if (manual) return;
    if (entry.isIntersecting) play();
    else stop();
  }, { threshold: .3 });
  io.observe(root);
})();
