/* ---------- Lightweight SVG charts (no dependencies) ---------- */

(function () {
  const NS = "http://www.w3.org/2000/svg";
  let seq = 0;

  function node(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        const v = attrs[key];
        if (v !== null && v !== undefined) el.setAttribute(key, v);
      });
    }
    return el;
  }

  function txt(str, attrs) {
    const t = node("text", attrs);
    t.textContent = str;
    return t;
  }

  function tip(parent, message) {
    const t = node("title");
    t.textContent = message;
    parent.appendChild(t);
    return parent;
  }

  function svgRoot(w, h, aria) {
    const svg = node("svg", {
      viewBox: `0 0 ${w} ${h}`,
      class: "chart-svg",
      role: "img",
      preserveAspectRatio: "xMidYMid meet",
    });
    svg.style.width = `${w}px`;
    svg.style.maxWidth = "none";
    if (aria) svg.setAttribute("aria-label", aria);
    return svg;
  }

  function showEmpty(mount, message) {
    if (!mount) return;
    mount.innerHTML = "";
    const p = document.createElement("p");
    p.className = "chart-empty";
    p.textContent = message || "No data for this range.";
    mount.appendChild(p);
  }

  function truncate(str, max) {
    const s = String(str == null ? "" : str);
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function labelIndexes(count, max) {
    if (count <= max) return Array.from({ length: count }, (_, i) => i);
    const step = Math.ceil(count / max);
    const out = [];
    for (let i = 0; i < count; i += step) out.push(i);
    if (out[out.length - 1] !== count - 1) out.push(count - 1);
    return out;
  }

  function tickStep(range, target) {
    const raw = range / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw) || 0));
    const norm = raw / mag;
    const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return mult * mag;
  }

  function edgeAnchor(x, W, pad, text) {
    const half = (String(text).length * 6) / 2;
    if (x - half < pad.l) return "start";
    if (x + half > W - pad.r) return "end";
    return "middle";
  }

  function measure(mount, opts, fallback) {
    const w = opts.width || mount.clientWidth || 0;
    return Math.max(280, Math.round(w || fallback));
  }

  /* ---------- Line / area trend ---------- */

  function lineChart(mount, opts) {
    const values = opts.values || [];
    const labels = opts.labels || [];
    if (!values.length) return showEmpty(mount, opts.emptyText);

    const W = measure(mount, opts, 780);
    const H = opts.height || 250;
    const pad = { t: 14, r: 14, b: 30, l: 42 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const min = opts.min == null ? 0 : opts.min;
    const max = opts.max == null ? 100 : opts.max;
    const n = values.length;

    const X = (i) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = (v) => {
      const c = Math.min(max, Math.max(min, v));
      return pad.t + ih - ((c - min) / (max - min || 1)) * ih;
    };

    const svg = svgRoot(W, H, opts.ariaLabel);

    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4;
      const y = Y(v);
      svg.appendChild(node("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: "ch-grid" }));
      svg.appendChild(
        txt(Math.round(v) + "%", { x: pad.l - 8, y: y + 4, class: "ch-axis-label", "text-anchor": "end" })
      );
    }

    const pts = values.map((v, i) => [X(i), Y(v)]);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");

    const gradId = `chGrad${++seq}`;
    const defs = node("defs");
    const grad = node("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(node("stop", { offset: "0%", class: "ch-grad-top" }));
    grad.appendChild(node("stop", { offset: "100%", class: "ch-grad-bottom" }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    svg.appendChild(
      node("path", {
        d: `${d} L${pts[n - 1][0].toFixed(2)} ${(pad.t + ih).toFixed(2)} L${pts[0][0].toFixed(2)} ${(
          pad.t + ih
        ).toFixed(2)} Z`,
        fill: `url(#${gradId})`,
        class: "ch-area",
      })
    );
    svg.appendChild(node("path", { d, class: "ch-line" }));

    if (n <= 70) {
      pts.forEach((p, i) => {
        const c = node("circle", { cx: p[0], cy: p[1], r: 3.4, class: "ch-dot" });
        tip(c, `${labels[i] || ""} — ${Math.round(values[i])}% present`);
        svg.appendChild(c);
      });
    }

    labelIndexes(n, opts.maxLabels || 6).forEach((i) => {
      const lb = labels[i] || "";
      svg.appendChild(
        txt(lb, {
          x: X(i),
          y: H - 10,
          class: "ch-axis-label",
          "text-anchor": edgeAnchor(X(i), W, pad, lb),
        })
      );
    });

    mount.innerHTML = "";
    mount.appendChild(svg);
  }

  /* ---------- Stacked vertical bars ---------- */

  function stackedBarChart(mount, opts) {
    const labels = opts.labels || [];
    const series = opts.series || [];
    if (!labels.length) return showEmpty(mount, opts.emptyText);

    const avail = measure(mount, opts, 780);
    const slot = opts.slot || 26;
    const pad = { t: 14, r: 10, b: 34, l: 36 };
    const need = labels.length * slot + pad.l + pad.r;
    const W = Math.max(avail, need);
    const H = opts.height || 240;
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;

    const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
    const peak = Math.max(1, ...totals);
    const step = tickStep(peak, 4);
    const top = Math.max(step, Math.ceil(peak / step) * step);

    const svg = svgRoot(W, H, opts.ariaLabel);

    for (let v = 0; v <= top + 0.001; v += step) {
      const y = pad.t + ih - (v / top) * ih;
      svg.appendChild(node("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: "ch-grid" }));
      svg.appendChild(
        txt(String(Math.round(v)), { x: pad.l - 8, y: y + 4, class: "ch-axis-label", "text-anchor": "end" })
      );
    }

    const barW = Math.max(4, Math.min(18, slot - 9));

    labels.forEach((lb, i) => {
      const cx = pad.l + i * slot + slot / 2;
      let acc = 0;
      series.forEach((s) => {
        const v = s.values[i] || 0;
        if (v <= 0) return;
        const h = (v / top) * ih;
        const y = pad.t + ih - ((acc + v) / top) * ih;
        const rect = node("rect", {
          x: cx - barW / 2,
          y,
          width: barW,
          height: Math.max(1, h),
          rx: 3,
          class: s.className || "ch-bar",
        });
        tip(rect, `${lb} — ${s.name}: ${v}`);
        svg.appendChild(rect);
        acc += v;
      });
    });

    labelIndexes(labels.length, opts.maxLabels || 12).forEach((i) => {
      svg.appendChild(
        txt(labels[i], {
          x: pad.l + i * slot + slot / 2,
          y: H - 12,
          class: "ch-axis-label",
          "text-anchor": "middle",
        })
      );
    });

    mount.innerHTML = "";
    if (need > avail) {
      const scroll = document.createElement("div");
      scroll.className = "chart-scroll";
      scroll.appendChild(svg);
      mount.appendChild(scroll);
    } else {
      mount.appendChild(svg);
    }
  }

  /* ---------- Percent vertical bars ---------- */

  function percentBarChart(mount, opts) {
    const labels = opts.labels || [];
    const values = opts.values || [];
    if (!labels.length) return showEmpty(mount, opts.emptyText);

    const W = measure(mount, opts, 780);
    const H = opts.height || 220;
    const pad = { t: 22, r: 12, b: 30, l: 42 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;

    const svg = svgRoot(W, H, opts.ariaLabel);

    for (let i = 0; i <= 4; i++) {
      const v = i * 25;
      const y = pad.t + ih - (v / 100) * ih;
      svg.appendChild(node("line", { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: "ch-grid" }));
      svg.appendChild(
        txt(v + "%", { x: pad.l - 8, y: y + 4, class: "ch-axis-label", "text-anchor": "end" })
      );
    }

    const slot = iw / labels.length;
    const barW = Math.max(10, Math.min(56, slot - 14));

    labels.forEach((lb, i) => {
      const v = Math.max(0, Math.min(100, values[i] || 0));
      const h = (v / 100) * ih;
      const x = pad.l + i * slot + (slot - barW) / 2;
      const y = pad.t + ih - h;
      const rect = node("rect", { x, y, width: barW, height: Math.max(1, h), rx: 4, class: opts.className || "ch-bar" });
      tip(rect, `${lb} — ${Math.round(v)}%`);
      svg.appendChild(rect);
      svg.appendChild(
        txt(`${Math.round(v)}%`, { x: x + barW / 2, y: y - 6, class: "ch-value-label", "text-anchor": "middle" })
      );
      svg.appendChild(txt(lb, { x: x + barW / 2, y: H - 12, class: "ch-axis-label", "text-anchor": "middle" }));
    });

    mount.innerHTML = "";
    mount.appendChild(svg);
  }

  /* ---------- Horizontal bars ---------- */

  function hBarChart(mount, opts) {
    const items = opts.items || [];
    if (!items.length) return showEmpty(mount, opts.emptyText);

    const W = measure(mount, opts, 780);
    const rowH = 25;
    const padTop = 6;
    const padBottom = 6;
    const labelW = opts.labelWidth || Math.min(165, Math.max(90, W * 0.32));
    const valueW = 58;
    const barX = labelW + 12;
    const barW = Math.max(40, W - barX - valueW);
    const H = padTop + items.length * rowH + padBottom;
    const max = opts.max || 100;

    const svg = svgRoot(W, H, opts.ariaLabel);

    items.forEach((it, i) => {
      const y = padTop + i * rowH;
      const h = rowH - 9;
      const cy = y + h / 2 + 4;

      svg.appendChild(
        txt(truncate(it.label, Math.floor(labelW / 6.6)), {
          x: labelW,
          y: cy,
          class: "ch-axis-label",
          "text-anchor": "end",
        })
      );
      svg.appendChild(node("rect", { x: barX, y, width: barW, height: h, rx: h / 2, class: "ch-bar-track" }));

      const w = Math.max(2, (Math.max(0, Math.min(max, it.value)) / max) * barW);
      const rect = node("rect", {
        x: barX,
        y,
        width: w,
        height: h,
        rx: h / 2,
        class: it.className || "ch-bar",
      });
      tip(rect, `${it.label} — ${it.display || Math.round(it.value)}`);
      svg.appendChild(rect);

      svg.appendChild(txt(it.display || String(it.value), { x: barX + barW + 8, y: cy, class: "ch-value-label" }));
    });

    mount.innerHTML = "";
    mount.appendChild(svg);
  }

  /* ---------- Donut ---------- */

  function donutChart(mount, opts) {
    const items = (opts.items || []).filter((i) => i.value > 0);
    const total = items.reduce((a, i) => a + i.value, 0);
    if (!total) return showEmpty(mount, opts.emptyText);

    const size = Math.min(220, Math.max(170, measure(mount, opts, 210)));
    const r = size / 2 - 22;
    const sw = Math.round(size * 0.115);
    const c = size / 2;
    const circ = 2 * Math.PI * r;

    const svg = svgRoot(size, size, opts.ariaLabel);
    let offset = 0;

    items.forEach((it) => {
      const len = (it.value / total) * circ;
      const seg = node("circle", {
        cx: c,
        cy: c,
        r,
        fill: "none",
        "stroke-width": sw,
        class: it.className || "ch-bar",
      });
      seg.setAttribute("stroke-dasharray", `${len} ${circ - len}`);
      seg.setAttribute("stroke-dashoffset", String(-offset));
      seg.setAttribute("transform", `rotate(-90 ${c} ${c})`);
      tip(seg, `${it.label}: ${it.value} student(s) — ${Math.round((it.value / total) * 100)}%`);
      svg.appendChild(seg);
      offset += len;
    });

    svg.appendChild(txt(String(total), { x: c, y: c + 2, class: "ch-center-value", "text-anchor": "middle" }));
    svg.appendChild(
      txt(opts.centerLabel || "students", { x: c, y: c + 21, class: "ch-center-label", "text-anchor": "middle" })
    );

    mount.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "chart-donut";
    wrap.appendChild(svg);
    mount.appendChild(wrap);
  }

  /* ---------- Heatmap ---------- */

  function heatmap(mount, opts) {
    const rows = opts.rows || [];
    const cols = opts.cols || [];
    if (!rows.length || !cols.length) return showEmpty(mount, opts.emptyText);

    const wrap = document.createElement("div");
    wrap.className = "heatmap-scroll";

    const table = document.createElement("table");
    table.className = "heatmap";

    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "hm-corner";
    corner.textContent = "Student";
    hr.appendChild(corner);
    cols.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.textContent = r.label;
      th.title = r.label;
      tr.appendChild(th);
      r.cells.forEach((cell, i) => {
        const td = document.createElement("td");
        td.className = `hm-cell hm-${cell || "none"}`;
        td.title = `${r.label} — ${cols[i]} — ${
          cell === "present" ? "Present" : cell === "absent" ? "Absent" : "Not marked (counts as absent)"
        }`;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrap.appendChild(table);
    mount.innerHTML = "";
    mount.appendChild(wrap);
  }

  window.MinaCharts = {
    lineChart,
    stackedBarChart,
    percentBarChart,
    hBarChart,
    donutChart,
    heatmap,
  };
})();
