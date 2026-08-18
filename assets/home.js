/* 首页动效：首屏「一批数据 → 三塔生长 + 性能柱」、榜单预览、指针光晕。 */

const HOME_REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- 首屏：一批数据到来 → 三塔自上而下生长 + 热力三档性能柱 -------------- */
(() => {
  const host = document.getElementById('hero-scene');
  if (!host) return;

  // 一塔一个任务：塔头是刚学会的那一批，之后每过一个阶段向下长一格（重新评测）
  // 一批 = 6 个各不相同的样本（3×2）；塔上留下的是这批的代表样本
  const TASKS = [
    { name: '动物', pool: ['cat', 'dog', 'horse', 'rabbit', 'bird', 'elephant'] },
    { name: '交通', pool: ['car', 'plane', 'train', 'bus', 'bicycle', 'ship'] },
    { name: '水果', pool: ['apple', 'banana', 'orange', 'strawberry', 'grapes', 'pear'] },
  ];
  const BCOL = 3;
  const ZS = [41, 38, 23];
  // ROWS[k] = 学完第 k+1 批后在已见各批上的准确率；PEAK[j] = 第 j 批刚学完时的成绩
  const ROWS = [[96], [89, 94], [86, 90, 95]];
  const PEAK = [96, 94, 95];
  const N = TASKS.length;

  // 学会 = 生长（快出慢收），遗忘 = 回退（慢起慢收）：不读数字也分得出谁在退
  const EASE = {
    grow: (p) => 1 - Math.pow(1 - p, 5),
    retreat: (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  };

  // 单元 (j, r)：第 j 座塔在第 r 个阶段的状态；r ≥ j，塔头即 r = j
  const CELLS = [];
  for (let j = 0; j < N; j++) for (let r = j; r < N; r++) CELLS.push({ j, r });
  const VIZ = ['var(--viz-a)', 'var(--viz-b)', 'var(--viz-c)'];

  const shotImg = (name) =>
    `<span class="ph"><img src="${BASE}assets/img/samples/${name}.jpg" alt="" width="72" height="72"></span>`;

  const hs = document.createElement('div');
  hs.className = 'hs';
  hs.innerHTML =
    `<div class="hs-stage">
      ${CELLS.map(({ j, r }) =>
        `<figure class="hs-cell${r === j ? ' head' : ''}" data-j="${j}" data-r="${r}">
          ${shotImg(TASKS[j].pool[r % TASKS[j].pool.length])}<span class="hs-tag"></span>
        </figure>`).join('')}
      ${TASKS.map((t, k) => t.pool.map((s, i) =>
        `<figure class="hs-shot" data-k="${k}" data-i="${i}">${shotImg(s)}</figure>`).join('')).join('')}
    </div>
    <i class="hs-hair"></i>
    <div class="hs-chart">
      <div class="hs-plotarea">
        <div class="hs-bars">${TASKS.map((_, j) =>
          `<span class="hs-bar" style="--c:${VIZ[j]}"><i class="hs-loss"></i><i class="hs-fill"></i><span class="hs-num"><em></em><b>0</b></span></span>`).join('')}</div>
      </div>
      <div class="hs-caps">${TASKS.map((t) => `<span>${t.name}</span>`).join('')}</div>
    </div>`;
  host.replaceChildren(hs);

  const stage = hs.querySelector('.hs-stage');
  const cells = [...hs.querySelectorAll('.hs-cell')];
  const cellAt = (j, r) => cells[CELLS.findIndex((c) => c.j === j && c.r === r)];
  const shots = [...hs.querySelectorAll('.hs-shot')];
  const shotsOf = (k) => shots.filter((el) => Number(el.dataset.k) === k);
  const bars = [...hs.querySelectorAll('.hs-bar')];

  let timers = [], rafs = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const stop = () => {
    timers.forEach(clearTimeout); timers = [];
    rafs.forEach(cancelAnimationFrame); rafs = [];
  };


  // 几何：上方是数据流区，下方三座塔；塔 j 的轨道自第 j 行起，向下到底
  const M = 52, GY = 6, GX = 14, SW = 32, SG = 4;
  let slot = null;
  const measure = () => {
    const W = stage.clientWidth, H = stage.clientHeight;
    const gridW = N * M + (N - 1) * GX, gridH = N * M + (N - 1) * GY;
    const x0 = (W - gridW) / 2, y0 = H - 4 - gridH;
    slot = {
      cell: (j, r) => ({ x: x0 + j * (M + GX), y: y0 + r * (M + GY), w: M }),
      shot: (i, n) => {
        const rows = Math.ceil(n / BCOL);
        const cw = BCOL * SW + (BCOL - 1) * SG, ch = rows * SW + (rows - 1) * SG;
        const bx = (W - cw) / 2, by = Math.max(2, (y0 - ch) / 2);
        return { x: bx + (i % BCOL) * (SW + SG), y: by + Math.floor(i / BCOL) * (SW + SG), w: SW };
      },
    };
  };

  const place = (el, at) => {
    el.style.transform = `translate(${at.x}px, ${at.y}px)`;
    if (at.w) el.style.width = at.w + 'px';
    if (at.h) el.style.height = at.h + 'px';
  };

  // 当前阶段那一行最实，越靠上的阶段越暗：那批数据已不可再访问，能力也在被遗忘
  const ageRows = (now) => cells.forEach((el) => {
    const r = Number(el.dataset.r);
    if (r > now) return;
    el.classList.remove('age-0', 'age-1', 'age-2');
    el.classList.add('age-' + Math.min(2, now - r));
  });

  const put = (j, v, showLoss) => {
    const bar = bars[j];
    bar.style.setProperty('--h', v + '%');
    bar.style.setProperty('--pk', PEAK[j] + '%');
    bar.style.setProperty('--go', showLoss && PEAK[j] > v + .4 ? 1 : 0);
    bar.querySelector('.hs-num b').textContent = Math.round(v);
  };

  const tween = (j, to, ms, ease, showLoss) => {
    const bar = bars[j];
    const from = Number(bar.dataset.v ?? to);
    bar.dataset.v = to;
    if (ms <= 0) { put(j, to, showLoss); return; }
    const t0 = performance.now();
    const step = () => {
      const p = Math.max(0, Math.min(1, (performance.now() - t0) / ms));
      put(j, from + (to - from) * ease(p), showLoss);
      if (p < 1) rafs.push(requestAnimationFrame(step));
    };
    rafs.push(requestAnimationFrame(step));
  };

  const setDelta = (j, v) => {
    const d = Math.round(PEAK[j] - v);
    const em = bars[j].querySelector('.hs-num em');
    em.textContent = d ? `−${d}` : '';
    em.classList.toggle('show', !!d);
  };

  const flipCat = () => {
    const el = cellAt(0, N - 1);
    el.querySelector('.hs-tag').textContent = '苹果 ✗';
    el.classList.add('flag');
  };

  const reset = () => {
    measure();
    cells.forEach((el) => {
      const j = Number(el.dataset.j), r = Number(el.dataset.r);
      el.className = 'hs-cell' + (r === j ? ' head' : '');
      el.querySelector('.hs-tag').textContent = '';
      place(el, slot.cell(j, r));
    });
    shots.forEach((el) => {
      el.className = 'hs-shot';
      const at = slot.shot(Number(el.dataset.i), TASKS[Number(el.dataset.k)].pool.length);
      place(el, { x: at.x, y: at.y - 76, w: SW });
    });
    bars.forEach((bar, j) => {
      bar.classList.remove('on');
      bar.dataset.v = ZS[j];
      const em = bar.querySelector('.hs-num em');
      em.textContent = ''; em.classList.remove('show');
      put(j, ZS[j], false);
    });
  };

  // 无动画：直接给出终局（三塔长满、塔内自上而下变淡、猫已被误判）
  const finalState = () => {
    reset();
    cells.forEach((el) => el.classList.add('in'));
    ageRows(N - 1);
    flipCat();
    ROWS[N - 1].forEach((v, j) => {
      bars[j].classList.add('on');
      bars[j].dataset.v = v;
      put(j, v, true);
      setDelta(j, v);
    });
  };

  if (HOME_REDUCED) {
    finalState();
    return;
  }

  // 三拍 + 收束拍，整轮约 9.8s
  const D = { intro: 600, beat: 2150, grow: 700, retreat: 820, stagger: 70 };

  const cycle = () => {
    stop();
    reset();
    hs.classList.remove('out');

    for (let k = 0; k < N; k++) {
      const at = D.intro + k * D.beat;

      // 一批数据一起到来：飞入数据流区 → 脉冲学习 → 收进本塔塔头
      const n = TASKS[k].pool.length;
      shotsOf(k).forEach((el, i) => {
        later(() => { el.classList.add('in'); place(el, slot.shot(i, n)); }, at + i * 45);
        later(() => el.classList.add('learn'), at + 470 + i * 25);
        later(() => {
          const head = slot.cell(k, k);
          el.classList.remove('learn');
          el.classList.add('gone');
          place(el, { x: head.x + M / 2 - SW / 2, y: head.y + M / 2 - SW / 2, w: SW * .5 });
        }, at + 920 + i * 30);
      });
      later(() => {
        cellAt(k, k).classList.add('in');
        ageRows(k);
      }, at + 1010);

      // 三塔一起向下长一格：旧塔在新阶段被重新评测，颜色随之变淡
      later(() => {
        for (let j = 0; j < k; j++) cellAt(j, k).classList.add('in');
        ageRows(k);
      }, at + 1380);

      // 柱子：新批由灰转本塔颜色并生长，旧批延后回退并留下峰值影子
      ROWS[k].forEach((v, j) => {
        if (j === k) {
          later(() => { bars[j].classList.add('on'); tween(j, v, D.grow, EASE.grow, false); }, at + 1010);
        } else {
          later(() => {
            tween(j, v, D.retreat, EASE.retreat, true);
            later(() => setDelta(j, v), D.retreat * .55);
          }, at + 1380 + j * D.stagger);
        }
      });

      // 数值落定之后再说话，文案不抢在数据前面
      if (k === N - 1) later(flipCat, at + 1760);
    }

    // 收束拍：误判的猫与动物柱的缺口互相指认
    const end = D.intro + N * D.beat + 200;
    later(() => {
      cellAt(0, N - 1).classList.add('blink');
      bars[0].classList.add('spot');
    }, end);

    // 淡出后在不可见处归零，再开下一轮
    later(() => hs.classList.add('out'), end + 2100);
    later(cycle, end + 2600);
  };

  // 只在可见时跑，滚出视口即停
  const io = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      cycle();
    } else {
      stop();
      hs.classList.remove('out');
    }
  }, { threshold: .25 });
  io.observe(host);
})();

/* ---- 榜单与评测：切换各设定；有收录结果的设定在口径上方加一张节选表 -------- */
(() => {
  const root = document.getElementById('board-preview');
  if (!root) return;
  const chips = [...root.querySelectorAll('.chip[data-board]')];
  const panes = [...root.querySelectorAll('.board-pane')];
  const badge = root.querySelector('[data-board-badge]');
  const note = root.querySelector('[data-board-note]');
  const emptyNote = note ? note.textContent : '';

  // 徽记与脚注跟随当前设定的收录状态：无结果亮「待发布」，有结果说明是节选。
  // .badge 自带 display，hidden 属性会被压掉，须用行内 style 收起
  const sync = () => {
    const active = panes.find((p) => !p.hidden);
    const has = !!(active && active.dataset.hasRows);
    if (badge) badge.style.display = has ? 'none' : '';
    if (note) note.textContent = has ? '按 ACC 排序的节选' : emptyNote;
  };

  chips.forEach((chip) => chip.addEventListener('click', () => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    panes.forEach((pane) => { pane.hidden = pane.dataset.pane !== chip.dataset.board; });
    sync();
  }));

  (async () => {
    const COLS = {
      cil: { type: '类型', cols: [['acc', 'ACC'], ['aia', 'AIA'], ['f', '遗忘 ↓']] },
      clip: { type: '类型', cols: [['acc', 'ACC'], ['aia', 'AIA'], ['bwt', 'BWT'], ['zs', '零样本保持']] },
      tune: { type: '家族', cols: [['acc', 'ACC'], ['aia', 'AIA'], ['bwt', 'BWT'], ['f', '遗忘 ↓'], ['gen', '通用保持']] },
    };
    let data;
    try {
      data = await fetch(`${document.body.dataset.base || './'}data/results.json`, { cache: 'no-store' })
        .then((r) => r.json());
    } catch (e) { return; } // 数据取不到（如 file:// 打开）：保持纯口径卡
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const val = (r, id) => (r.metrics && typeof r.metrics[id] === 'number' ? r.metrics[id] : null);

    panes.forEach((pane) => {
      const spec = COLS[pane.dataset.pane];
      const all = (data[pane.dataset.pane] && data[pane.dataset.pane].rows) || [];
      if (!spec || !all.length) return;

      // 有多个基准序列时只节选最先声明的一组：不同组的数字不可比，不混排
      const key = all[0].benchmark || '';
      const rows = all.filter((r) => (r.benchmark || '') === key)
        .sort((a, b) => (val(b, 'acc') ?? -Infinity) - (val(a, 'acc') ?? -Infinity))
        .slice(0, 5);
      const withBackbone = rows.some((r) => r.backbone);
      const span = 3 + (withBackbone ? 1 : 0) + spec.cols.length;
      const accs = rows.map((r) => val(r, 'acc')).filter((v) => v !== null);
      const lo = Math.min(...accs), hi = Math.max(...accs);

      const body = rows.map((r, i) => {
        const cells = spec.cols.map(([id], k) => {
          const v = val(r, id);
          const text = v === null ? '—' : v.toFixed(1);
          if (k !== 0 || v === null) return `<td class="num">${text}</td>`;
          const pct = hi > lo ? Math.round(8 + 92 * (v - lo) / (hi - lo)) : 100;
          return `<td class="num bar"><i class="fill" style="width:${pct}%"></i><span>${text}</span></td>`;
        }).join('');
        const tags = (r.tags || []).map((t) => ` <span class="tag">${esc(t)}</span>`).join('');
        const backbone = withBackbone ? `<td class="mono">${esc(r.backbone || '—')}</td>` : '';
        return `<tr><td class="rank">${i + 1}</td><td><b>${esc(r.method)}</b>${tags}</td>` +
          `<td class="dim">${esc(r.family)}</td>${backbone}${cells}</tr>`;
      }).join('');

      pane.insertAdjacentHTML('afterbegin', `
        <div class="board-table">
          <div class="table-scroll">
            <table class="doc">
              <thead><tr>
                <th style="width:44px">#</th><th>方法</th><th style="width:104px">${spec.type}</th>
                ${withBackbone ? '<th style="width:120px">骨干</th>' : ''}
                ${spec.cols.map(([, label]) => `<th style="width:104px;text-align:right">${label}</th>`).join('')}
              </tr></thead>
              <tbody>${key ? `<tr class="group"><td colspan="${span}">${esc(key)}</td></tr>` : ''}${body}</tbody>
            </table>
          </div>
        </div>`);
      pane.dataset.hasRows = '1';
    });
    sync();
  })();
})();

/* ---- 我们的项目：项目轨道与终端联动 ---------------------------------------- */
(() => {
  const suite = document.getElementById('proj-suite');
  if (!suite) return;
  const tabs = [...suite.querySelectorAll('.suite-tab')];
  const panes = [...suite.querySelectorAll('.code-pane')];
  const rows = [...suite.querySelectorAll('.suite-linkrow')];
  const name = suite.querySelector('[data-suite-name]');
  const NAMES = { clight: 'clightning · 安装与使用', agent: 'clagent · 技能与运行', ocr: 'clocr · 训练与评测' };

  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const key = tab.dataset.proj;
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    panes.forEach((p) => { p.hidden = p.dataset.pane !== key; });
    rows.forEach((r) => { r.hidden = r.dataset.links !== key; });
    if (name) name.textContent = NAMES[key] || key;
  }));
})();

/* 指针光晕已并入 site.js 的全局液态玻璃系统（.lg），此处不再单独驱动 */
