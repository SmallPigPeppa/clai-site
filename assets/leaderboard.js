/* 结果表：从 data/results.json 渲染各问题设定；尚无收录结果时表内只留口径说明。
   收录结果只改 results.json（行字段见 website/README.md，构建时自动校验）：
   骨干列的显隐、基准分组、标注章、排名与排序都随数据生成，页面不用再动。 */

(async () => {
  const bar = document.getElementById('bench-bar');
  const host = document.getElementById('bench-panes');
  if (!bar || !host) return;

  // 每种设定的指标列不同；desc=true 表示越大越好，排序默认降序。
  // spec 为该设定的完整口径，渲染在结果表上方——口径的唯一权威副本在本页，
  // 首页榜单卡只保留要点。
  const BENCH = {
    cil: {
      type: '类型',
      cols: [
        { id: 'acc', label: 'ACC', desc: true },
        { id: 'aia', label: 'AIA', desc: true },
        { id: 'f', label: '遗忘 ↓', desc: false },
      ],
      spec: {
        setting: '每阶段到来新的类别；推理时不给任务身份，须在已见的全部类别中判别。',
        backbone: 'ResNet 系',
        seq: '按类别划分的增量序列，各方法沿同一顺序训练',
        metrics: 'ACC · AIA · 遗忘度',
        align: '训练预算与任务顺序在方法间一致；使用回放缓存的方法之间缓存规模对齐，不保留旧样本的非样本（non-exemplar）方法单独标注。',
      },
    },
    clip: {
      type: '类型',
      cols: [
        { id: 'acc', label: 'ACC', desc: true },
        { id: 'aia', label: 'AIA', desc: true },
        { id: 'bwt', label: 'BWT', desc: true },
        { id: 'zs', label: '零样本保持', desc: true },
      ],
      spec: {
        setting: '标签空间不变，各阶段的数据来自不同领域；预训练获得的零样本迁移能力本身也是须保持的对象。',
        backbone: 'CLIP ViT-B/16',
        seq: 'COCO → Flickr30k → Food500Cap → KREAM → Lexica → Pet → TextCaps → WikiArt',
        metrics: 'ACC · AIA · BWT · 零样本保持',
        align: '骨干与微调预算一致；零样本保持度量预训练迁移能力的留存，其评测集不参与任何阶段的训练。',
      },
    },
    tune: {
      type: '家族',
      cols: [
        { id: 'acc', label: 'ACC', desc: true },
        { id: 'aia', label: 'AIA', desc: true },
        { id: 'bwt', label: 'BWT', desc: true },
        { id: 'f', label: '遗忘 ↓', desc: false },
        { id: 'gen', label: '通用保持', desc: true },
      ],
      spec: {
        setting: '每阶段到来一个新的指令任务；既有指令能力与基座的通用能力都须保持。',
        backbone: 'LLaVA-1.5 · Qwen2-VL · Qwen2.5-VL · Qwen3-VL · InternVL3.5',
        seq: '多模态指令任务序列（ScienceQA、TextVQA、ImageNet 等），逐任务微调同一基座',
        metrics: 'ACC · AIA · BWT · 遗忘度 · 通用保持',
        align: 'LoRA 秩、训练预算与任务顺序在方法间一致；通用保持的基准不参与训练。遗忘为越低越好，其余指标越高越好。',
      },
    },
  };

  const base = document.body.dataset.base || './';
  let data;
  try {
    // no-store：完全绕过 HTTP 缓存。构建用 copytree 保留源文件 mtime，重建后的
    // 文件可能比缓存里的一版更「旧」，no-cache 的 304 协商会把旧数值端上来
    data = await fetch(`${base}data/results.json`, { cache: 'no-store' }).then((r) => r.json());
  } catch (e) {
    host.innerHTML = '<p class="filter-count">结果加载失败：请通过本地服务器或线上地址访问本页。</p>';
    return;
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rowsOf = (name) => (data[name] && data[name].rows) || [];
  const val = (row, id) => (row.metrics && typeof row.metrics[id] === 'number' ? row.metrics[id] : null);

  // 任一设定有了收录结果，页首的「尚无收录结果」提示即撤下；但若这批数值是示意
  // 数据（results.json 的 provisional），提示换成出处说明继续挂着——占位数字不能
  // 借着表格的形式冒充实测结果
  const provisional = Object.keys(BENCH).some((name) => (data[name] || {}).provisional);
  const headNote = document.getElementById('bench-empty-note');
  if (headNote && Object.keys(BENCH).some((name) => rowsOf(name).length)) {
    if (provisional) {
      headNote.innerHTML = '<div><b>示意数据</b>下表数值为占位示意，仅用于展示榜单的结构、'
        + `分组与排序交互；在实测结果通过<a href="${base}evaluation#checks">协议核查</a>并发布之前，`
        + '本页不构成任何方法之间比较的依据。</div>';
    } else {
      headNote.remove();
    }
  }

  host.innerHTML = Object.entries(BENCH).map(([name, spec], i) => `
    <div class="bench-pane" data-bench="${name}"${i ? ' hidden' : ''}>
      <div class="board-card" style="margin-bottom:var(--s-5)">
        <dl class="board-spec">
          <div><dt>问题设定</dt><dd>${esc(spec.spec.setting)}</dd></div>
          <div><dt>骨干</dt><dd class="mono">${esc(spec.spec.backbone)}</dd></div>
          <div><dt>任务序列</dt><dd>${esc(spec.spec.seq)}</dd></div>
          <div><dt>报告指标</dt><dd class="mono">${esc(spec.spec.metrics)}</dd></div>
          <div><dt>对齐条件</dt><dd>${esc(spec.spec.align)}</dd></div>
        </dl>
      </div>
      <div class="table-scroll">
        <table class="doc" data-bench="${name}">
          <thead>
            <tr>
              <th style="width:44px">#</th>
              <th style="width:190px">方法</th>
              <th style="width:104px">${spec.type}</th>
              ${rowsOf(name).some((r) => r.backbone) ? '<th style="width:120px">骨干</th>' : ''}
              ${spec.cols.map((c, k) =>
                `<th class="sort" data-col="${k}" style="width:104px;text-align:right">${c.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`).join('');

  // 方法格：名称（有 paper 时挂链接）+ 标注章 + 小字一行（出处 · 备注 · 配置）
  const methodCell = (r) => {
    const name = r.paper ? `<a href="${esc(r.paper)}">${esc(r.method)}</a>` : esc(r.method);
    const tags = (r.tags || []).map((t) => ` <span class="tag">${esc(t)}</span>`).join('');
    const sub = [
      r.venue && esc(r.venue),
      r.note && esc(r.note),
      r.config && `<a href="${esc(r.config)}">配置</a>`,
    ].filter(Boolean).join(' · ');
    return `<td><b>${name}</b>${tags}${sub ? `<span class="sub">${sub}</span>` : ''}</td>`;
  };

  const render = (name, col, desc) => {
    const spec = BENCH[name];
    const rows = rowsOf(name);
    const withBackbone = rows.some((r) => r.backbone);
    const span = 3 + (withBackbone ? 1 : 0) + spec.cols.length;
    const tbody = host.querySelector(`table[data-bench="${name}"] tbody`);

    // 收录之前不摆占位数字：整表只留一行说明，读者不会把示意当结果
    if (!rows.length) {
      tbody.innerHTML =
        `<tr class="bench-empty"><td colspan="${span}">尚无收录结果：通过协议核查的数值将在此发布。</td></tr>`;
      return;
    }

    // 基准序列不同的行分组成子表：数字只在同组内可比，排名、排序与数值条都按组结算
    const groups = [];
    rows.forEach((r) => {
      const key = r.benchmark || '';
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push((g = { key, rows: [] }));
      g.rows.push(r);
    });

    const id = spec.cols[col].id;
    tbody.innerHTML = groups.map((g) => {
      const sorted = [...g.rows].sort((a, b) => {
        const x = val(a, id), y = val(b, id);
        if (x === null && y === null) return 0;
        if (x === null) return 1; // 未报告（null）的行排在末尾
        if (y === null) return -1;
        return desc ? y - x : x - y;
      });
      const accs = sorted.map((r) => val(r, spec.cols[0].id)).filter((v) => v !== null);
      const lo = Math.min(...accs), hi = Math.max(...accs);

      const body = sorted.map((r, i) => {
        const cells = spec.cols.map((c, k) => {
          const v = val(r, c.id);
          const text = v === null ? '—' : v.toFixed(1);
          if (k !== 0 || v === null) return `<td class="num">${text}</td>`;
          const pct = hi > lo ? Math.round(8 + 92 * (v - lo) / (hi - lo)) : 100;
          return `<td class="num bar"><i class="fill" style="width:${pct}%"></i><span>${text}</span></td>`;
        }).join('');
        const backbone = withBackbone ? `<td class="mono">${esc(r.backbone || '—')}</td>` : '';
        return `<tr><td class="rank">${i + 1}</td>${methodCell(r)}<td class="dim">${esc(r.family)}</td>${backbone}${cells}</tr>`;
      }).join('');
      return (g.key ? `<tr class="group"><td colspan="${span}">${esc(g.key)}</td></tr>` : '') + body;
    }).join('');
  };

  Object.keys(BENCH).forEach((name) => {
    render(name, 0, true);
    const table = host.querySelector(`table[data-bench="${name}"]`);
    const heads = [...table.querySelectorAll('th.sort')];
    // 空表无从排序：撤掉表头的可排序标记，避免点了没反应
    if (!rowsOf(name).length) {
      heads.forEach((th) => th.classList.remove('sort'));
      return;
    }
    heads[0].setAttribute('aria-sort', 'descending');

    heads.forEach((th) => th.addEventListener('click', () => {
      const col = +th.dataset.col;
      const prev = th.getAttribute('aria-sort');
      // 首次点按该列的自然方向排（遗忘等越低越好的列先升序），再点翻转
      const desc = prev ? prev !== 'descending' : BENCH[name].cols[col].desc;
      heads.forEach((h) => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', desc ? 'descending' : 'ascending');
      render(name, col, desc);
    }));
  });

  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    bar.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    host.querySelectorAll('.bench-pane').forEach((p) => { p.hidden = p.dataset.bench !== chip.dataset.bench; });
  });
})();
