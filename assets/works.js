/* 相关工作：从 data/works.json 渲染，支持类别筛选与关键词过滤。
   方法、综述、基准与工具在同一张表里，类别列区分类型。 */

(async () => {
  const bar = document.getElementById('work-filters');
  const table = document.getElementById('work-table');
  const count = document.getElementById('work-count');
  if (!bar || !table) return;

  const base = document.body.dataset.base || './';
  let data;
  try {
    data = await fetch(`${base}data/works.json`).then((r) => r.json());
  } catch (e) {
    count.textContent = '条目加载失败：请通过本地服务器或线上地址访问本页。';
    return;
  }

  const { cats, families, kinds, items } = data;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const chip = (key) => `<button type="button" class="chip" data-cat="${key}" aria-pressed="false">${esc(cats[key])}</button>`;

  // 左边是方法谱系，右边是奠基文献 / 综述 / 基准 / 工具
  bar.innerHTML = `
    <button type="button" class="chip" data-cat="all" aria-pressed="true">全部</button>
    ${families.map(chip).join('')}
    <span class="chip-sep" aria-hidden="true"></span>
    ${kinds.map(chip).join('')}
    <input class="filter-input" id="work-q" type="search" placeholder="按名称、机制或发表检索…" autocomplete="off">`;

  const tbody = table.tBodies[0];
  tbody.innerHTML = [...items]
    // 年份缺省（尚未发表的自研方法与框架实现）排在最后
    .sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.name.localeCompare(b.name))
    .map((w) => `
      <tr data-cat="${esc(w.cat)}" data-text="${esc((w.name + w.note + w.venue).toLowerCase())}" id="${esc(w.name)}">
        <td class="num"${w.year ? '' : ' data-sort="9999"'}>${w.year || '—'}</td>
        <td><b>${esc(w.name)}</b></td>
        <td class="dim">${esc(cats[w.cat] || w.cat)}</td>
        <td class="dim">${esc(w.note)}</td>
        <td class="mono">${esc(w.venue)}</td>
        <td>${w.libs.length
          ? w.libs.map((l) => `<span class="tag">${esc(l)}</span>`).join(' ')
          : '<span class="dim">—</span>'}</td>
      </tr>`).join('');

  const input = document.getElementById('work-q');
  let cat = 'all';

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    [...tbody.rows].forEach((row) => {
      const ok = (cat === 'all' || row.dataset.cat === cat) && (!q || row.dataset.text.includes(q));
      row.hidden = !ok;
      if (ok) shown += 1;
    });
    // 只在筛掉了东西时才报数：全表在眼前，不必念一遍总量
    count.textContent = shown === items.length ? '' : `筛出 ${shown} / ${items.length}`;
  };

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    cat = btn.dataset.cat;
    bar.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
    apply();
  });
  input.addEventListener('input', apply);
  apply();

  // ⌘K 跳转过来时高亮对应行
  if (location.hash) {
    const row = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    row?.scrollIntoView({ block: 'center' });
    row?.classList.add('is-target');
  }
})();
