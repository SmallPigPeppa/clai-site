/* 全站通用行为：导航、主题、代码块、表格排序、滚动揭示、⌘K 检索。
   每块都是独立的 IIFE，任何一块出错都不影响其余部分。 */

const BASE = document.body.dataset.base || './';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- 顶栏：滚动态 ------------------------------------------------------- */
(() => {
  const head = document.getElementById('site-head');
  if (!head) return;
  const sync = () => head.classList.toggle('is-scrolled', window.scrollY > 4);
  sync();
  addEventListener('scroll', sync, { passive: true });
})();

/* ---- 顶栏：下拉面板 ----------------------------------------------------- */
(() => {
  const groups = [...document.querySelectorAll('.nav-group')];
  if (!groups.length) return;

  let openTimer;

  const close = (group) => {
    const menu = group.querySelector('.nav-menu');
    group.classList.remove('is-open');
    group.querySelector('.nav-trigger').setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-shown');
    setTimeout(() => { if (!group.classList.contains('is-open')) menu.hidden = true; }, 200);
  };

  const open = (group) => {
    groups.filter((g) => g !== group).forEach(close);
    const menu = group.querySelector('.nav-menu');
    group.classList.add('is-open');
    group.querySelector('.nav-trigger').setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    requestAnimationFrame(() => menu.classList.add('is-shown'));
  };

  groups.forEach((group) => {
    const trigger = group.querySelector('.nav-trigger');

    trigger.addEventListener('click', () => {
      group.classList.contains('is-open') ? close(group) : open(group);
    });
    // 指针操作用悬停，带一点延迟避免划过就弹开
    group.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      clearTimeout(openTimer);
      openTimer = setTimeout(() => open(group), 90);
    });
    group.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      clearTimeout(openTimer);
      openTimer = setTimeout(() => close(group), 160);
    });
  });

  addEventListener('keydown', (e) => { if (e.key === 'Escape') groups.forEach(close); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-group')) groups.forEach(close);
  });
})();

/* ---- 顶栏：移动端抽屉 --------------------------------------------------- */
(() => {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('mobile-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const open = nav.hidden;
    nav.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    document.body.classList.toggle('is-menu-open', open);
  });

  // 视口回到桌面宽度时收起，避免状态残留
  matchMedia('(min-width: 941px)').addEventListener('change', (e) => {
    if (!e.matches) return;
    nav.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-menu-open');
  });
})();

/* ---- 主题切换 ----------------------------------------------------------- */
(() => {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  const effective = () =>
    document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  btn.addEventListener('click', () => {
    const next = effective() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('cl-theme', next); } catch (e) { /* 隐私模式 */ }
  });
})();

/* ---- 代码块：标签页与复制 ----------------------------------------------- */
(() => {
  document.querySelectorAll('.code, .bib').forEach((block) => {
    const tabs = [...block.querySelectorAll('.code-tab')];
    const panes = [...block.querySelectorAll('.code-pane')];

    tabs.forEach((tab) => tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      panes.forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
    }));

    const copy = block.querySelector('.code-copy, .bib-copy');
    if (!copy) return;
    copy.addEventListener('click', async () => {
      const pre = (panes.find((p) => !p.hidden) || block).querySelector('pre');
      try {
        await navigator.clipboard.writeText(pre.innerText.trimEnd());
        copy.classList.add('is-done');
        setTimeout(() => copy.classList.remove('is-done'), 1600);
      } catch (e) {
        // 只标红并给出提示，不动按钮内容——纯图标按钮被文字顶掉就回不来了
        copy.classList.add('is-fail');
        copy.title = '复制失败，请手动选择文本';
        setTimeout(() => copy.classList.remove('is-fail'), 1600);
      }
    });
  });
})();

/* ---- 表格排序（任意带 th.sort 的 table.doc） ----------------------------- */
(() => {
  const value = (row, col) => {
    const cell = row.children[col];
    const raw = (cell.dataset.sort ?? cell.textContent).trim();
    const num = parseFloat(raw.replace(/[−–—]/, '-'));
    return Number.isNaN(num) ? raw : num;
  };

  document.querySelectorAll('table.doc').forEach((table) => {
    const heads = [...table.querySelectorAll('th.sort')];
    if (!heads.length) return;
    const tbody = table.tBodies[0];

    heads.forEach((th) => th.addEventListener('click', () => {
      const col = [...th.parentElement.children].indexOf(th);
      const desc = th.getAttribute('aria-sort') !== 'descending';
      heads.forEach((h) => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', desc ? 'descending' : 'ascending');

      [...tbody.rows]
        .sort((a, b) => {
          const [x, y] = [value(a, col), value(b, col)];
          const cmp = typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y), 'zh-CN');
          return desc ? -cmp : cmp;
        })
        .forEach((row) => tbody.appendChild(row));
    }));
  });
})();

/* ---- 滚动揭示 ----------------------------------------------------------- */
(() => {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;
  if (REDUCED || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }

  // 同一父容器下的兄弟节点依次进场
  const seen = new Map();
  targets.forEach((el) => {
    const n = seen.get(el.parentElement) || 0;
    el.style.setProperty('--i', String(n));
    seen.set(el.parentElement, n + 1);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });

  targets.forEach((el) => io.observe(el));
})();

/* ---- ⌘K 全站检索 -------------------------------------------------------- */
(() => {
  const root = document.getElementById('palette');
  const input = document.getElementById('palette-input');
  const list = document.getElementById('palette-list');
  if (!root || !input || !list) return;

  const PAGES = [
    ['首页', '背景 · 相关工作与榜单 · 项目 · 团队', ''],
    ['持续学习入门', '灾难性遗忘 · 问题设定 · 方法谱系', 'learn'],
    ['评测协议', 'CL 矩阵 · 指标定义 · 协议有效性检查', 'evaluation'],
    ['相关工作', '方法 · 奠基文献 · 综述 · 基准 · 工具库', 'works'],
    ['榜单', '各问题设定下的评测口径与结果表', 'leaderboard'],
    ['CLightning 方法库', '套件总览', 'libraries'],
    ['CLightCIL', '类增量学习库', 'libraries/cil'],
    ['CLightCLIP', '视觉语言模型持续微调库', 'libraries/clip'],
    ['CLightMLLM', '多模态大模型持续指令微调库', 'libraries/mllm'],
    ['CLAgent', '以持续学习为核心能力的自进化智能体', 'agent'],
    ['CLOCR', '文字识别的持续学习', 'ocr'],
    ['团队', '指导教师与贡献者', 'team'],
  ].map(([title, desc, path]) => ({ title, desc, href: BASE + path, kind: '页面' }));

  let index = PAGES;
  let loaded = false;
  let items = [];
  let active = 0;

  // 相关工作的条目按需加载，首屏不为检索付费
  const load = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const works = await fetch(`${BASE}data/works.json`).then((r) => r.json());
      index = [
        ...PAGES,
        ...works.items.map((w) => ({
          title: w.name,
          desc: `${w.venue} · ${w.note}`,
          href: `${BASE}works#${encodeURIComponent(w.name)}`,
          kind: works.cats[w.cat] || w.cat,
        })),
      ];
      if (!root.hidden) render(input.value);
    } catch (e) {
      // file:// 下 fetch 会失败，退回只搜页面
    }
  };

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => s.toLowerCase().replace(/[\s·—–-]/g, '');

  const render = (query) => {
    const q = norm(query);
    const hits = (q ? index.filter((it) => norm(it.title + it.desc + it.kind).includes(q)) : index).slice(0, 40);
    active = 0;

    if (!hits.length) {
      list.innerHTML = `<li class="palette-empty">没有匹配「${esc(query)}」的条目</li>`;
      return;
    }
    list.innerHTML = hits.map((it, i) => `
      <li role="option" class="${i === 0 ? 'is-active' : ''}" aria-selected="${i === 0}">
        <a href="${it.href}"><b>${esc(it.title)}</b><span>${esc(it.desc)}</span><i class="kind">${it.kind}</i></a>
      </li>`).join('');
  };

  const move = (delta) => {
    const options = [...list.children].filter((li) => li.matches('[role="option"]'));
    if (!options.length) return;
    options[active]?.classList.remove('is-active');
    active = (active + delta + options.length) % options.length;
    const current = options[active];
    current.classList.add('is-active');
    current.scrollIntoView({ block: 'nearest' });
  };

  let lastFocus = null;
  const open = () => {
    lastFocus = document.activeElement;
    root.hidden = false;
    input.value = '';
    render('');
    load();
    input.focus();
  };
  const close = () => {
    root.hidden = true;
    lastFocus?.focus();
  };

  document.getElementById('search-open')?.addEventListener('click', open);
  root.querySelectorAll('[data-palette-close]').forEach((el) => el.addEventListener('click', close));
  input.addEventListener('input', () => render(input.value));

  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      root.hidden ? open() : close();
      return;
    }
    if (root.hidden) {
      // 在输入框外按 / 也能唤起
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        open();
      }
      return;
    }
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    if (e.key === 'Enter') {
      const link = list.querySelector('li.is-active a');
      if (link) { e.preventDefault(); location.href = link.href; }
    }
  });
})();

/* ---- 液态玻璃：指针光源 --------------------------------------------------
   一个指针循环喂三层（对应 site.css 材质节）：
   .aura-light 惯性追指针——玻璃身后的光是真的在动；.aura 反向微视差；
   登记的玻璃面注入 .glint 反光层，按指针的局部坐标与距离点亮。
   指针停稳后循环自己停表，没有常驻的 rAF。 */
(() => {
  if (REDUCED || matchMedia('(hover: none)').matches) return;
  const aura = document.querySelector('.aura');
  if (!aura) return;

  const light = document.createElement('div');
  light.className = 'aura-light';
  light.setAttribute('aria-hidden', 'true');
  aura.after(light);

  const HOSTS = '.head-inner, .nav-menu, .palette-panel, .suite, .board-card, .card, .paths a, .glow-card';
  const hosts = [...new Set(document.querySelectorAll(HOSTS))].map((el) => {
    el.classList.add('glint-host');
    const layer = document.createElement('i');
    layer.className = 'glint';
    layer.setAttribute('aria-hidden', 'true');
    el.append(layer);
    return { el, lit: false };
  });

  const REACH = 180;                     // 指针离面多近开始点亮
  let px = -1e4, py = -1e4;              // 指针位置
  let lx = innerWidth / 2, ly = -240;    // 光源惯性位置
  let ax = 0, ay = 0;                    // 氛围层视差当前值
  let raf = 0;

  const step = () => {
    raf = 0;
    // 光源以固定比例追指针：快甩快追、慢移慢跟，拖尾即「液感」
    lx += (px - lx) * .11;
    ly += (py - ly) * .11;
    light.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;

    // 氛围层反向微视差（translate 与 keyframes 的 transform 互不覆盖）
    const tx = (px / innerWidth - .5) * -22;
    const ty = (py / innerHeight - .5) * -14;
    ax += (tx - ax) * .07;
    ay += (ty - ay) * .07;
    aura.style.translate = `${ax.toFixed(1)}px ${ay.toFixed(1)}px`;

    for (const h of hosts) {
      const r = h.el.getBoundingClientRect();
      // 不在视口附近或整体隐藏的面直接熄灭，别的都不写
      if (!r.width || r.bottom < -REACH || r.top > innerHeight + REACH) {
        if (h.lit) { h.el.style.setProperty('--glint-o', '0'); h.lit = false; }
        continue;
      }
      const dx = Math.max(r.left - px, 0, px - r.right);
      const dy = Math.max(r.top - py, 0, py - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d >= REACH) {
        if (h.lit) { h.el.style.setProperty('--glint-o', '0'); h.lit = false; }
        continue;
      }
      h.el.style.setProperty('--glint-x', `${(px - r.left).toFixed(1)}px`);
      h.el.style.setProperty('--glint-y', `${(py - r.top).toFixed(1)}px`);
      h.el.style.setProperty('--glint-o', (1 - d / REACH).toFixed(3));
      h.lit = true;
    }

    // 还没追上就继续走，追上了停表；指针再动会再叫醒
    if (Math.abs(px - lx) > .4 || Math.abs(py - ly) > .4 ||
        Math.abs(tx - ax) > .4 || Math.abs(ty - ay) > .4) {
      raf = requestAnimationFrame(step);
    }
  };

  addEventListener('pointermove', (e) => {
    px = e.clientX;
    py = e.clientY;
    light.classList.add('is-on');
    if (!raf) raf = requestAnimationFrame(step);
  }, { passive: true });

  // 指针离开窗口：光源熄掉，所有反光归零
  document.documentElement.addEventListener('pointerleave', () => {
    light.classList.remove('is-on');
    hosts.forEach((h) => {
      if (h.lit) { h.el.style.setProperty('--glint-o', '0'); h.lit = false; }
    });
  });
})();
