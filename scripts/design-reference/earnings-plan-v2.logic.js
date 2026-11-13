class Component extends DCLogic {
  state = (() => {
    const c = (dir, mode, val, start, status, note, setup = '', setupCad = 'one') => ({ dir, mode, val, start, status, note, setup, setupCad, evid: '', owner: '', on: true });
    return {
      step: 0, view: 'proposed', loan: this.props.applyLoanTerms ?? true, open: null, ai: null, removed: null, showAllIssues: false,
      goal: '215000', goalEdit: false, planStart: '2027-01',
      confirm: { cogs: 1, sal: 1, rent: 1, ins: 1, mkt: 1, pro: 1, sw: 1 }, corr: {}, correcting: null, corrAmt: '', corrReason: '',
      cats: {}, cand: {}, newType: 'hourly',
      streams: [
        { id: 's1', name: 'Detail packages', type: 'units', f: [{ l: 'Units sold', v: '300', u: 'units / mo', vol: 1 }, { l: 'Price per unit', v: '250', u: '$' }] },
        { id: 's2', name: 'Fleet maintenance contracts', type: 'recurring', f: [{ l: 'Active contracts', v: '12', u: 'clients', vol: 1 }, { l: 'Monthly fee', v: '1500', u: '$' }] },
        { id: 's3', name: 'Paint correction labor', type: 'hourly', f: [{ l: 'Technicians', v: '2', u: 'people', vol: 1 }, { l: 'Billable hours each', v: '50', u: 'hrs / mo', vol: 1 }, { l: 'Hourly rate', v: '100', u: '$' }] },
      ],
      lines: [
        { id: 'c1', g: 'cogs', l: 'Detail supplies and chemicals', base: 378000, beh: 'unit', link: 's1' },
        { id: 'c2', g: 'cogs', l: 'Fleet parts', base: 118800, beh: 'pct', link: 's2' },
        { id: 'c3', g: 'cogs', l: 'Paint correction materials', base: 36000, beh: 'unit', link: 's3' },
        { id: 'c4', g: 'cogs', l: 'COGS not linked to a stream', base: 69086, beh: 'fixed', link: 'all' },
        { id: 'sal', g: 'sal', l: 'Salaries', base: 348194, beh: 'fixed', link: 'all' },
        { id: 'rent', g: 'rent', l: 'Rent', base: 196805, beh: 'fixed', link: 'all' },
        { id: 'ins', g: 'ins', l: 'Insurance', base: 22600, beh: 'fixed', link: 'all' },
        { id: 'mkt', g: 'mkt', l: 'Marketing', base: 18400, beh: 'fixed', link: 'all' },
        { id: 'pro', g: 'pro', l: 'Professional fees', base: 16500, beh: 'fixed', link: 'all' },
        { id: 'utl', g: 'utl', l: 'Utilities', base: 14300, beh: 'fixed', link: 'all' },
        { id: 'rep', g: 'rep', l: 'Repairs', base: 11200, beh: 'fixed', link: 'all' },
        { id: 'sw', g: 'sw', l: 'Software', base: 9800, beh: 'fixed', link: 'all' },
        { id: 'o1', g: 'oth', l: 'Card processing', base: 24720, beh: 'pct', link: 'all' },
        { id: 'o2', g: 'oth', l: 'Other operating', base: 2372, beh: 'fixed', link: 'all' },
      ],
      chg: {
        'f:s1:1': c('up', 'abs', '12', '2', 'approved', 'Price list moves to $262. Two nearby competitors charge $265 to $280.'),
        'f:s2:0': c('up', 'abs', '4', '4', 'proposed', ''),
        'f:s3:1': c('up', 'pct', '20', '3', 'proposed', ''),
        'l:c1': c('down', 'pct', '5', '4', 'proposed', 'Volume pricing from the chemical supplier above 350 units a month.'),
        'l:rent': c('down', 'abs', '28805', '4', 'approved', 'Lease amendment on bay 2 signed in October 2026.'),
        'l:sal': c('down', 'abs', '30194', '2', 'proposed', 'Front-desk role moves to part time once booking moves online.'),
        'l:ins': c('down', 'pct', '15', '6', 'proposed', 'Garage liability re-quoted at the June renewal.'),
        'l:sw': c('down', 'abs', '3400', '1', 'approved', 'Cancel one of two overlapping booking tools.'),
        'l:o1': c('down', 'abs', '0.4', '3', 'proposed', 'Harbor Payments quote: 1.60% all-in against 2.00% today.', '495', 'one'),
      },
      growth: [{ id: 'g1', name: 'Google Ads for detail packages', spend: '3000', stream: 's1', factor: 0, add: '40', start: '3', setup: '1500', setupCad: 'one', note: 'Local search campaign. 40 added bookings a month at $75 per booking.', evid: '', owner: '', status: 'proposed', on: true }],
      acts: [{ id: 'a1', name: 'Weekend detailer, part time', amt: '1200', start: '3', setup: '', setupCad: 'one', note: 'Covers the added Saturday bookings from the ads campaign.', evid: '', owner: '', status: 'proposed', on: true }],
      alloc: [{ id: 'x1', label: 'Google Ads campaign', purpose: 'planned', amt: '3000' }, { id: 'x2', label: 'Weekend detailer', purpose: 'planned', amt: '1200' }, { id: 'x3', label: 'Operating reserve', purpose: 'reserve', amt: '10000' }],
      sel: [], treat: 'unreconciled', recon: '', reason: '', reviewMsg: '',
      attest: false, notes: '', versions: [{ n: 1, when: 'Nov 11, 2026 · 4:05 PM' }], ver: '1', dirty: true, saved: '11:42 AM',
    };
  })();
  edit(fn) { const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); this.setState(p => ({ ...(typeof fn === 'function' ? fn(p) : fn), dirty: true, saved: t })); }
  renderVals() {
    const s = this.state, staff = (this.props.viewer ?? 'Staff') === 'Staff', target = this.props.dscrTarget ?? 1.25;
    const n = v => { const q = parseFloat(v); return isFinite(q) ? q : 0; };
    const IRS = { rev: 1236000, cogs: 601886, opex: 664891, other: 8400, dsCur: 777600, dsNew: 177600 };
    const G = [['cogs', 'Cost of goods sold', 601886, 588400], ['sal', 'Salaries', 348194, 351600], ['rent', 'Rent', 196805, 196800], ['ins', 'Insurance', 22600, 23100], ['mkt', 'Marketing', 18400, 16000], ['pro', 'Professional fees', 16500, 17300], ['utl', 'Utilities', 14300, 14900], ['rep', 'Repairs', 11200, 9600], ['sw', 'Software', 9800, 10400], ['oth', 'Other', 27092, 31200]].map(([k, l, irs, pl]) => ({ k, l, irs, pl }));
    const gLabel = Object.fromEntries(G.map(g => [g.k, g.l]));
    const noi0 = IRS.rev - IRS.cogs - IRS.opex, e0 = noi0 + IRS.other, ds = s.loan ? IRS.dsNew : IRS.dsCur;
    const ab = v => Math.round(Math.abs(v)).toLocaleString('en-US');
    const $ = v => (v <= -0.5 ? '−$' : '$') + ab(v), d$ = v => (v >= 0 ? '+$' : '−$') + ab(v);
    const x = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + 'x', dx = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + 'x';
    const pc = v => (v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%';
    const nf = (v, d = 2) => v.toLocaleString('en-US', { maximumFractionDigits: d });
    const fmtF = (f, v) => f.u === '$' ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : f.u === '%' ? nf(v, 1) + '%' : nf(v) + ' ' + f.u;
    const sg = c => c.dir === 'up' ? 1 : -1, cmd = (b, c) => c.mode === 'pct' ? b * (1 + sg(c) * n(c.val) / 100) : b + sg(c) * n(c.val);
    const TYPES = {
      units: ['Units sold', 'unit', [['Units sold', '0', 'units / mo', 1], ['Price per unit', '0', '$']]],
      hourly: ['Hourly fees', 'billable hour', [['Billable staff', '0', 'people', 1], ['Hours each', '0', 'hrs / mo', 1], ['Utilization', '100', '%', 1], ['Hourly rate', '0', '$']]],
      services: ['Professional services', 'engagement', [['Engagements', '0', 'per mo', 1], ['Average fee', '0', '$']]],
      recurring: ['Recurring contracts', 'contract-month', [['Active clients', '0', 'clients', 1], ['Retention', '100', '%', 1], ['Monthly fee', '0', '$']]],
      rental: ['Rental or occupancy', 'occupied unit-month', [['Rentable units', '0', 'units', 1], ['Occupancy', '0', '%', 1], ['Monthly rent', '0', '$']]],
      commission: ['Commission or % of volume', 'dollar processed', [['Processed volume', '0', 'dollars / mo', 1], ['Take rate', '0', '%']]],
      custom: ['Custom metrics', 'unit', [['Metric', '0', 'count', 1], ['Value per metric', '0', '$']]],
    };
    const stById = Object.fromEntries(s.streams.map(st => [st.id, st])), lineById = Object.fromEntries(s.lines.map(l => [l.id, l]));
    const S = (on, baseTot) => {
      const vol = {}, rev = {}, fv = {}; let tot = 0;
      s.streams.forEach(st => {
        const v = st.f.map((f, i) => { const id = 'f:' + st.id + ':' + i, c = s.chg[id]; return c && on(id) ? Math.max(0, cmd(n(f.v), c)) : n(f.v); });
        s.growth.forEach(g => { if (g.stream === st.id && on('gr:' + g.id) && v[g.factor] != null) v[g.factor] += n(g.add); });
        let vp = 1, pp = 1; st.f.forEach((f, i) => { const k = f.u === '%' ? v[i] / 100 : v[i]; if (f.vol) vp *= k; else pp *= k; });
        vol[st.id] = vp * 12; rev[st.id] = vp * pp * 12; fv[st.id] = v; tot += rev[st.id];
      });
      const pr = s.chg.pricing;
      if (pr && on('pricing') && baseTot) { const m = pr.mode === 'pct' ? 1 + sg(pr) * n(pr.val) / 100 : 1 + sg(pr) * n(pr.val) / baseTot; Object.keys(rev).forEach(k => { rev[k] *= m; }); tot *= m; }
      return { vol, rev, tot, fv };
    };
    const S0 = S(() => false, 0), rate = {};
    s.lines.forEach(l => { const d = l.beh === 'unit' ? S0.vol[l.link] : l.beh === 'pct' ? (l.link === 'all' ? S0.tot : S0.rev[l.link]) : 0; rate[l.id] = d ? l.base / d : 0; });
    const eff = l => l.beh !== 'fixed' && !rate[l.id] ? 'fixed' : l.beh;
    const ev = on => {
      const st = S(on, S0.tot), amt = {};
      s.lines.forEach(l => {
        const id = 'l:' + l.id, c = s.chg[id], a = c && on(id), b = eff(l); let v;
        if (b === 'fixed') v = a ? cmd(l.base, c) : l.base;
        else if (b === 'unit') v = (a ? cmd(rate[l.id], c) : rate[l.id]) * (st.vol[l.link] || 0);
        else { let p = rate[l.id]; if (a) p = c.mode === 'pct' ? cmd(p, c) : p + sg(c) * n(c.val) / 100; v = p * (l.link === 'all' ? st.tot : st.rev[l.link] || 0); }
        amt[l.id] = Math.max(0, v);
      });
      ['cogs', 'oth'].forEach(g => { const id = 'g:' + g, c = s.chg[id]; if (!c || !on(id)) return; const kids = s.lines.filter(l => l.g === g), t = kids.reduce((q, l) => q + amt[l.id], 0), f = c.mode === 'pct' ? 1 + sg(c) * n(c.val) / 100 : t ? 1 + sg(c) * n(c.val) / t : 1; kids.forEach(l => { amt[l.id] = Math.max(0, amt[l.id] * f); }); });
      let extra = 0;
      s.growth.forEach(g => { if (on('gr:' + g.id)) extra += n(g.spend) * 12 + (g.setupCad === 'mo' ? n(g.setup) * 12 : 0); });
      s.acts.forEach(a => { if (on('na:' + a.id)) extra += n(a.amt) * 12 + (a.setupCad === 'mo' ? n(a.setup) * 12 : 0); });
      Object.keys(s.chg).forEach(id => { if (on(id) && s.chg[id].setupCad === 'mo') extra += n(s.chg[id].setup) * 12; });
      const cogs = s.lines.filter(l => l.g === 'cogs').reduce((q, l) => q + amt[l.id], 0), opex = s.lines.filter(l => l.g !== 'cogs').reduce((q, l) => q + amt[l.id], 0) + extra;
      const rev = IRS.rev + st.tot - S0.tot, noi = rev - cogs - opex;
      return { rev, cogs, opex, noi, e: noi + IRS.other, amt, st, extra };
    };
    const items = [];
    Object.keys(s.chg).forEach(id => items.push({ id, c: s.chg[id], kind: 'chg', area: id === 'pricing' ? 0 : id.startsWith('f:') ? 1 : (id === 'g:cogs' || (lineById[id.slice(2)] || {}).g === 'cogs') ? 3 : 4 }));
    s.growth.forEach(g => items.push({ id: 'gr:' + g.id, c: g, kind: 'gr', area: 2 }));
    s.acts.forEach(a => items.push({ id: 'na:' + a.id, c: a, kind: 'na', area: 5 }));
    const byId = Object.fromEntries(items.map(i => [i.id, i])), areaOf = q => byId[q] ? byId[q].area : -1;
    const labelOf = id => { if (id === 'pricing') return 'Overall pricing'; const [k, a, b] = id.split(':'); if (k === 'f') { const st = stById[a]; return st ? st.name + ' · ' + ((st.f[b] || {}).l || 'metric') : 'Metric'; } if (k === 'l') return (lineById[a] || {}).l || 'Cost'; if (k === 'g') return 'Whole group: ' + gLabel[a]; return byId[id] ? byId[id].c.name : id; };
    const P = id => { const i = byId[id]; return !!i && i.c.on !== false && i.c.status !== 'rejected'; };
    const R = id => { const i = byId[id]; return !!i && i.c.on !== false && i.c.status === 'approved'; };
    const rv = s.view === 'reviewed', V = rv ? R : P;
    const startOf = id => Math.min(12, Math.max(1, parseInt(byId[id].c.start) || 1));
    const EP = ev(P), ER = ev(R), EV = rv ? ER : EP;
    const months = pred => Array.from({ length: 12 }, (_, k) => { const m = k + 1, r = ev(id => pred(id) && startOf(id) <= m), one = items.filter(i => pred(i.id) && startOf(i.id) === m && i.c.setupCad !== 'mo').reduce((q, i) => q + n(i.c.setup), 0); return { e: r.e / 12 - one, noi: r.noi / 12 - one }; });
    const MP = months(P), MR = months(R), MV = rv ? MR : MP;
    const fy = M => ({ e: M.reduce((q, m) => q + m.e, 0), noi: M.reduce((q, m) => q + m.noi, 0) }), FP = fy(MP), FR = fy(MR), FV = rv ? FR : FP;
    const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], [py, pm] = s.planStart.split('-').map(Number);
    const mName = i => MN[(pm - 1 + i) % 12] + ' ' + (py + Math.floor((pm - 1 + i) / 12));
    const monthOpts = Array.from({ length: 12 }, (_, i) => ({ v: String(i + 1), l: mName(i) }));
    const ed = fn => this.edit(fn);
    const patchItem = (id, patch) => ed(p => id.startsWith('gr:') ? { growth: p.growth.map(g => 'gr:' + g.id === id ? { ...g, ...patch } : g) } : id.startsWith('na:') ? { acts: p.acts.map(a => 'na:' + a.id === id ? { ...a, ...patch } : a) } : { chg: { ...p.chg, [id]: { ...p.chg[id], ...patch } } });
    const val = (id, k) => e => patchItem(id, { [k]: e.target.value, status: 'proposed' }), txt = (id, k) => e => patchItem(id, { [k]: e.target.value });
    const removeItem = id => ed(p => { if (id.startsWith('gr:')) return { growth: p.growth.filter(g => 'gr:' + g.id !== id), removed: { id, v: p.growth.find(g => 'gr:' + g.id === id) }, open: null }; if (id.startsWith('na:')) return { acts: p.acts.filter(a => 'na:' + a.id !== id), removed: { id, v: p.acts.find(a => 'na:' + a.id === id) }, open: null }; const chg = { ...p.chg }, v = chg[id]; delete chg[id]; return { chg, removed: { id, v }, open: null }; });
    const newChg = patch => ({ dir: 'up', mode: 'pct', val: '', start: '1', status: 'proposed', note: '', setup: '', setupCad: 'one', evid: '', owner: '', on: true, ...patch });
    const cache = {};
    const stat = id => {
      if (cache[id]) return cache[id];
      const i = byId[id], w = ev(q => P(q) || q === id), wo = ev(q => P(q) && q !== id), d = w.e - wo.e, st = startOf(id), one = i.c.setupCad === 'mo' ? 0 : n(i.c.setup), inc = P(id);
      const mv = []; if (Math.abs(w.rev - wo.rev) >= 1) mv.push('Revenue ' + d$(w.rev - wo.rev));
      s.lines.forEach(l => { const dq = w.amt[l.id] - wo.amt[l.id]; if (Math.abs(dq) >= 1) mv.push(l.l + ' ' + d$(dq)); });
      if (Math.abs(w.extra - wo.extra) >= 1) mv.push('Activity spend ' + d$(w.extra - wo.extra));
      return (cache[id] = { d, dRev: w.rev - wo.rev, chip: 'EBITDA ' + d$(d) + ' / yr', tag: 'num tag ' + (Math.abs(d) < 1 ? 'tag-neutral' : d > 0 ? 'tag-success' : 'tag-danger'), dscr: 'DSCR ' + dx(d / ds), fy: 'First year ' + d$(d * (13 - st) / 12 - one), moves: mv.length ? 'Moves ' + mv.slice(0, 4).join(' · ') + (mv.length > 4 ? ' · ' + (mv.length - 4) + ' more' : '') : 'No effect yet',
        spark: Array.from({ length: 12 }, (_, k) => { const live = inc && k + 1 >= st; return { h: live ? '14px' : '3px', c: live ? (d >= 0 ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-neutral-300)' }; }) });
    };
    const ctl = id => {
      const i = byId[id], c = i.c, missing = P(id) && !(c.note || '').trim(), op = s.open === id;
      return { ...stat(id), rn: id.replace(/[^a-z0-9]/gi, '_'), has: true, none: false, on: c.on !== false, opacity: c.on === false || c.status === 'rejected' ? 0.55 : 1, toggle: () => patchItem(id, { on: c.on === false, status: 'proposed' }),
        start: String(startOf(id)), setStart: val(id, 'start'), setup: c.setup, setSetup: val(id, 'setup'), setupOne: c.setupCad !== 'mo', setupMo: c.setupCad === 'mo', setOne: () => patchItem(id, { setupCad: 'one', status: 'proposed' }), setMo: () => patchItem(id, { setupCad: 'mo', status: 'proposed' }),
        note: c.note, setNote: txt(id, 'note'), evid: c.evid, setEvid: txt(id, 'evid'), owner: c.owner, setOwner: txt(id, 'owner'), noteBorder: missing ? 'var(--color-warning)' : 'var(--color-neutral-300)',
        open: op, toggleOpen: () => this.setState(p => ({ open: p.open === id ? null : id })), openLabel: op ? 'Close details' : missing ? 'Explain change' : 'Details', remove: () => removeItem(id),
        statusTag: 'tag ' + (c.status === 'approved' ? 'tag-success' : c.status === 'rejected' ? 'tag-danger' : missing ? 'tag-warning' : 'tag-neutral'), statusText: c.status === 'approved' ? 'Reviewed' : c.status === 'rejected' ? 'Rejected' : missing ? 'Explanation needed' : 'Proposed', border: missing ? 'var(--color-warning)' : 'transparent',
        isCmd: i.kind === 'chg', isGrowth: i.kind === 'gr', isAct: i.kind === 'na', named: i.kind !== 'chg', fixedName: i.kind === 'chg', ai: false, showAi: false,
        isUp: c.dir === 'up', isDown: c.dir !== 'up', setUp: () => patchItem(id, { dir: 'up', status: 'proposed' }), setDown: () => patchItem(id, { dir: 'down', status: 'proposed' }), isAbs: c.mode === 'abs', isPct: c.mode !== 'abs', setAbs: () => patchItem(id, { mode: 'abs', status: 'proposed' }), setPct: () => patchItem(id, { mode: 'pct', status: 'proposed' }), val: c.val, setVal: val(id, 'val') };
    };
    const AI = {
      c1: ['Volume pricing from the chemical supplier above 350 units a month lowers unit cost by about 5%.', { dir: 'down', mode: 'pct', val: '5' }],
      ins: ['Garage liability is re-quoted at renewal. Comparable shops in this area pay about 15% less.', { dir: 'down', mode: 'pct', val: '15' }],
      utl: ['An LED retrofit and an off-peak compressor schedule typically lower utilities by about 10%.', { dir: 'down', mode: 'pct', val: '10' }],
      rep: ['A preventive maintenance contract caps repairs at about $9,000 a year.', { dir: 'down', mode: 'abs', val: '2200' }],
      pro: ['A fixed $1,000 monthly bookkeeping fee replaces hourly billing.', { dir: 'down', mode: 'abs', val: '4500' }],
      sal: ['Online booking can replace one front-desk shift, about $30,000 a year.', { dir: 'down', mode: 'abs', val: '30000' }],
      rent: ['Renegotiate or sublease the second bay.', { dir: 'down', mode: 'abs', val: '28805' }],
      sw: ['Two booking tools overlap. Cancel one.', { dir: 'down', mode: 'abs', val: '3400' }],
      mkt: ['Keep spend flat and move print to search. Model the added bookings as a growth activity.', null],
    };
    const targetRow = (id, label, sub, curText, planText, planInk, absL, defaults, aiKey) => {
      const base = { id, label, sub, curText, planText, planInk, absL, rn: id.replace(/[^a-z0-9]/gi, '_') };
      if (s.chg[id]) return { ...ctl(id), ...base };
      const ai = aiKey ? AI[aiKey] : null;
      return { ...base, has: false, none: true, opacity: 1, border: 'transparent', open: false, isCmd: true, isGrowth: false, isAct: false, named: false, fixedName: true, ai: !!ai, showAi: !!ai && s.ai === id, aiText: ai ? ai[0] : '', canApplyAi: !!(ai && ai[1]),
        askAi: () => this.setState({ ai: id }), closeAi: () => this.setState({ ai: null }), applyAi: () => { if (ai && ai[1]) ed(p => ({ chg: { ...p.chg, [id]: newChg({ ...ai[1], note: ai[0] }) }, ai: null })); },
        change: () => ed(p => ({ chg: { ...p.chg, [id]: newChg(defaults) }, open: id })) };
    };
    const priced = s.chg.pricing ? S(q => q === 'pricing', S0.tot).tot - S0.tot : 0;
    const revRows = [targetRow('pricing', 'Overall pricing', 'All revenue streams · price only, volume unchanged', 'Current ' + $(S0.tot) + ' / yr', priced ? 'Price effect ' + d$(priced) + ' / yr' : '', 'var(--color-text)', '$ / yr', { dir: 'up', mode: 'pct' })];
    s.streams.forEach(st => st.f.forEach((f, i) => { const id = 'f:' + st.id + ':' + i, cur = n(f.v), pl = EP.st.fv[st.id][i]; revRows.push(targetRow(id, f.l, st.name, 'Current ' + fmtF(f, cur), Math.abs(pl - cur) > 1e-9 ? 'Plan ' + fmtF(f, pl) : '', 'var(--color-text)', f.u === '$' ? '$' : f.u === '%' ? 'pts' : f.u.split(' ')[0], { dir: 'up', mode: 'pct' })); }));
    const unitWord = st => (TYPES[st.type] || TYPES.custom)[1];
    const behText = l => { const b = eff(l), st = stById[l.link]; return gLabel[l.g] + ' · ' + (b === 'fixed' ? 'fixed' : b === 'unit' ? '$' + rate[l.id].toFixed(2) + ' per ' + unitWord(st) + ' of ' + st.name : (rate[l.id] * 100).toFixed(1) + '% of ' + (l.link === 'all' ? 'all revenue' : st.name + ' revenue')); };
    const lineRow = l => { const id = 'l:' + l.id, pl = EP.amt[l.id], moved = Math.abs(pl - l.base) >= 1; return targetRow(id, l.l, behText(l), 'Current ' + $(l.base) + ' / yr', moved ? 'Plan ' + $(pl) + ' / yr' + (!s.chg[id] ? ' · follows its driver' : '') : '', pl > l.base ? 'var(--color-danger)' : 'var(--color-success)', eff(l) === 'fixed' ? '$ / yr' : eff(l) === 'unit' ? '$ / unit' : 'pts', { dir: 'down', mode: 'pct' }, l.id); };
    const grpRow = (g, label) => { const kids = s.lines.filter(l => l.g === g), cur = kids.reduce((q, l) => q + l.base, 0), pl = kids.reduce((q, l) => q + EP.amt[l.id], 0); return targetRow('g:' + g, 'Whole group: ' + label, 'Applied proportionally to all ' + kids.length + ' items', 'Current ' + $(cur) + ' / yr', Math.abs(pl - cur) >= 1 ? 'Plan ' + $(pl) + ' / yr' : '', pl > cur ? 'var(--color-danger)' : 'var(--color-success)', '$ / yr', { dir: 'down', mode: 'pct' }); };
    const growthRows = s.growth.map(g => { const id = 'gr:' + g.id, c = ctl(id), st = stById[g.stream] || s.streams[0], spend = n(g.spend) * 12;
      return { ...c, label: g.name, setName: txt(id, 'name'), sub: 'Feeds ' + st.name, curText: 'Spend ' + $(spend) + ' / yr', planText: 'Returns $' + (spend ? c.dRev / spend : 0).toFixed(2) + ' revenue per $1', planInk: 'var(--color-text)', spend: g.spend, setSpend: val(id, 'spend'), add: g.add, setAdd: val(id, 'add'), stream: g.stream, setStream: e => patchItem(id, { stream: e.target.value, factor: 0, status: 'proposed' }), factor: String(g.factor), setFactor: e => patchItem(id, { factor: parseInt(e.target.value) || 0, status: 'proposed' }), facOpts: st.f.map((f, i) => ({ v: String(i), l: f.l, vol: f.vol })).filter(o => o.vol) }; });
    const actRows = s.acts.map(a => { const id = 'na:' + a.id; return { ...ctl(id), label: a.name, setName: txt(id, 'name'), sub: 'New operating cost', curText: 'Current $0', planText: 'Plan ' + $(n(a.amt) * 12) + ' / yr', planInk: 'var(--color-danger)', amt: a.amt, setAmt: val(id, 'amt') }; });
    const secTag = d => 'num tag ' + (Math.abs(d) < 1 ? 'tag-neutral' : d > 0 ? 'tag-success' : 'tag-danger');
    const sec = (title, sub, rows, areas, add, addLabel) => { const d = EP.e - ev(q => P(q) && !areas.includes(areaOf(q))).e; return { title, sub, rows, total: 'EBITDA ' + d$(d) + ' / yr', tag: secTag(d), canAdd: !!add, add: add || null, addLabel: addLabel || '' }; };
    const uid = () => Math.random().toString(36).slice(2, 8);
    const addGrowth = () => ed(p => { const id = uid(); return { growth: [...p.growth, { id, name: 'New growth activity', spend: '0', stream: p.streams[0].id, factor: 0, add: '0', start: '1', setup: '', setupCad: 'one', note: '', evid: '', owner: '', status: 'proposed', on: true }], open: 'gr:' + id }; });
    const addAct = () => ed(p => { const id = uid(); return { acts: [...p.acts, { id, name: 'New activity', amt: '0', start: '1', setup: '', setupCad: 'one', note: '', evid: '', owner: '', status: 'proposed', on: true }], open: 'na:' + id }; });
    const secs = [
      sec('Revenue drivers', 'Change any metric that produces revenue: price, volume, hours, utilization, contracts or occupancy. Costs linked to the stream move with it.', revRows, [0, 1]),
      sec('Growth activities', 'Spending that drives more activity. The added volume runs through the revenue model, so revenue, linked costs and card fees all follow.', growthRows, [2], addGrowth, 'Add growth activity'),
      sec('Cost of goods sold', 'Direct costs from the return, linked to the streams they serve.', [...s.lines.filter(l => l.g === 'cogs').map(lineRow), grpRow('cogs', 'Cost of goods sold')], [3]),
      sec('Operating expenses', 'Each deduction on the return. Lower or raise any line by an amount or a percent.', [...s.lines.filter(l => l.g !== 'cogs').map(lineRow), grpRow('oth', 'Other')], [4]),
      sec('New activities', 'Costs that do not exist today, such as a new hire or a new location.', actRows, [5], addAct, 'Add new activity'),
    ];
    const CATS = [['ptx', 'Payroll taxes'], ['trn', 'Transportation']];
    const iss = [];
    G.forEach(g => { if (!s.confirm[g.k]) iss.push({ label: 'Confirm ' + g.l + ' source amount', step: 0 }); });
    if (Math.abs(S0.tot - IRS.rev) > 1) iss.push({ label: 'Reconcile the revenue model to IRS revenue', step: 1 });
    CATS.forEach(([k, l]) => { if (!s.cats[k]) iss.push({ label: 'Answer ' + l + ': any current cost?', step: 1 }); });
    items.forEach(i => { if (P(i.id) && !(i.c.note || '').trim()) iss.push({ label: 'Explain ' + labelOf(i.id), step: 2, open: i.id }); });
    if (!s.attest) iss.push({ label: 'Confirm these disclosures and proposals', step: 3 });
    const goIssue = it => () => this.setState({ step: it.step, open: it.open || null });
    const titles = ['Confirm source', 'Revenue model and current costs', 'Plan changes', 'Review and save'];
    const subs = ['IRS 2025 · NOI ' + $(noi0), s.streams.length + ' revenue streams · ' + s.lines.length + ' costs', items.filter(i => P(i.id)).length + ' changes · ' + d$(EP.e - e0), 'DSCR ' + x(EV.e / ds) + ' · goal ' + x(target)];
    const savePlan = () => { if (iss.length) { const it = iss[0]; this.setState({ step: it.step, open: it.open || null }); return; } this.setState(p => ({ versions: [...p.versions, { n: p.versions.length + 1, when: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) }], ver: String(p.versions.length + 1), dirty: false })); };
    const m = (label, b, a, f, df, lowerGood) => { const good = lowerGood ? a <= b : a >= b, same = Math.abs(a - b) < 1e-6; return { label, before: f(b), after: f(a), delta: df(a - b), tag: 'num tag ' + (same ? 'tag-neutral' : good ? 'tag-success' : 'tag-danger'), ink: !lowerGood && a < 0 ? 'var(--color-danger)' : 'var(--color-text)', b, a }; };
    const metrics = [m('EBITDA', e0, EV.e, $, d$), m('NOI', noi0, EV.noi, $, d$), m('DSCR', e0 / IRS.dsCur, EV.e / ds, x, dx), m('Free cash flow', e0 - IRS.dsCur, EV.e - ds, $, d$), m('Operating margin', noi0 / IRS.rev, EV.noi / EV.rev, pc, v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + ' pts'), m('Debt service', IRS.dsCur, ds, $, d$, true)];
    const compare = metrics.map((r, i) => { const mx = Math.max(Math.abs(r.b), Math.abs(r.a), 1e-9); return { label: r.label, before: r.before, after: r.after, bw: Math.abs(r.b) / mx * 100 + '%', aw: Math.abs(r.a) / mx * 100 + '%', bc: r.b < 0 ? 'var(--color-danger)' : 'var(--color-neutral-400)', ac: r.a < 0 ? 'var(--color-danger)' : i === 5 ? 'var(--color-neutral-500)' : 'var(--color-accent)' }; });
    const areasW = ['Pricing', 'Revenue drivers', 'Growth', 'Cost of goods sold', 'Operating expenses', 'New activities'];
    let prev = e0; const wsteps = areasW.map((l, k) => { const e = ev(q => V(q) && areaOf(q) <= k).e, d = e - prev; prev = e; return [l, d]; });
    let cum = e0; const spans = [[Math.min(0, e0), Math.max(0, e0)]];
    wsteps.forEach(([, v]) => { spans.push([Math.min(cum, cum + v), Math.max(cum, cum + v)]); cum += v; });
    spans.push([Math.min(0, EV.e), Math.max(0, EV.e)]);
    const lo = Math.min(...spans.map(q => q[0])), hi = Math.max(...spans.map(q => q[1]), 1), pos = v => (v - lo) / (hi - lo) * 100;
    const wmeta = [['Baseline EBITDA', e0, 1], ...wsteps.map(([l, v]) => [l, v, 0]), ['Plan EBITDA', EV.e, 1]];
    const waterfall = wmeta.map(([label, v, tot], i) => ({ label, value: tot ? $(v) : d$(v), weight: tot ? 600 : 400, zero: pos(0) + '%', left: pos(spans[i][0]) + '%', width: Math.max(0.6, pos(spans[i][1]) - pos(spans[i][0])) + '%', color: tot ? (v < 0 ? 'var(--color-danger)' : 'var(--color-accent)') : v >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }));
    const pay = ds / 12, rmx = Math.max(pay, ...MV.map(q => Math.abs(q.e))) * 1.08, payTop = 120 - pay / rmx * 120;
    const ramp = MV.map((q, i) => ({ up: (q.e > 0 ? q.e / rmx * 120 : 0) + 'px', down: (q.e < 0 ? Math.min(30, -q.e / rmx * 120) : 0) + 'px', l: MN[(pm - 1 + i) % 12] }));
    const d0 = e0 / IRS.dsCur, d1 = EV.e / ds, sLo = -0.25, sHi = 1.75, sp = v => Math.min(100, Math.max(0, (v - sLo) / (sHi - sLo) * 100));
    const goal = n(s.goal) || 1, gvals = [noi0, EP.noi, ER.noi, goal], glo = Math.min(0, ...gvals), ghi = Math.max(1, ...gvals), gp = v => (8 + (v - glo) / (ghi - glo) * 84) + '%', gap = goal - EV.noi;
    const cap = s.loan ? 50000 : 0, allocated = s.alloc.reduce((q, a) => q + n(a.amt), 0);
    const cg = G.find(g => g.k === s.correcting);
    const reviewRows = items.map(i => { const c = i.c, st = stat(i.id); return { label: labelOf(i.id), checked: s.sel.includes(i.id), toggle: () => this.setState(p => ({ sel: p.sel.includes(i.id) ? p.sel.filter(q => q !== i.id) : [...p.sel, i.id] })), tag: 'tag ' + (c.status === 'approved' ? 'tag-success' : c.status === 'rejected' ? 'tag-danger' : 'tag-neutral'), status: c.status === 'approved' ? 'Approved' : c.status === 'rejected' ? 'Rejected' : 'Proposed', chip: d$(st.d) }; });
    const decide = status => ed(p => { const sel = p.sel; return { chg: Object.fromEntries(Object.entries(p.chg).map(([k, c]) => [k, sel.includes(k) ? { ...c, status } : c])), growth: p.growth.map(g => sel.includes('gr:' + g.id) ? { ...g, status } : g), acts: p.acts.map(a => sel.includes('na:' + a.id) ? { ...a, status } : a), sel: [], reason: '', recon: '', reviewMsg: (status === 'approved' ? 'Approved ' : 'Rejected ') + sel.length + ' change' + (sel.length === 1 ? '' : 's') + '. Reviewed projection updated.' }; });
    const fyRow = (label, cur, p, r, f, df) => ({ label, cur: f(cur), plan: f(p), rev: f(r), delta: df(p - cur), ink: p - cur >= 0 ? 'var(--color-success)' : 'var(--color-danger)' });
    const confirmedN = G.filter(g => s.confirm[g.k]).length;
    return {
      viewerChip: staff ? 'Staff view' : 'Client view', staff, clientView: !staff, saveText: s.dirty ? 'Draft saved ' + s.saved : 'Saved as v' + s.versions.length,
      savePlan, saveLabel: iss.length ? 'Complete required items · ' + iss.length : 'Save version and PDF',
      steps: titles.map((title, i) => { const on = s.step === i, cnt = iss.filter(it => it.step === i).length; return { n: i + 1, title, sub: subs[i], go: () => this.setState({ step: i }), border: on ? 'var(--color-accent)' : 'var(--color-divider)', bg: on ? 'var(--color-accent-100)' : 'var(--color-surface)', dot: on ? 'var(--color-accent)' : 'var(--color-neutral-200)', dotInk: on ? 'var(--color-on-accent)' : 'var(--color-text)', hasBadge: cnt > 0, badge: String(cnt) }; }),
      isS0: s.step === 0, isS1: s.step === 1, isS2: s.step === 2, isS3: s.step === 3,
      prev: () => this.setState(p => ({ step: Math.max(0, p.step - 1) })), next: () => s.step < 3 ? this.setState(p => ({ step: p.step + 1 })) : savePlan(), atFirst: s.step === 0, stepOf: 'Step ' + (s.step + 1) + ' of 4', nextLabel: s.step < 3 ? 'Continue to ' + titles[s.step + 1].toLowerCase() : (iss.length ? 'Complete required items' : 'Save version'),
      goalEditing: staff && s.goalEdit, goalShow: !(staff && s.goalEdit), goalVal: s.goal, setGoal: e => { const v = e.target.value; ed({ goal: v }); }, goalText: $(n(s.goal)) + ' / yr', toggleGoalEdit: () => this.setState(p => ({ goalEdit: !p.goalEdit })), goalEditLabel: s.goalEdit ? 'Done' : 'Edit goal',
      confirmedText: confirmedN + ' of ' + G.length + ' confirmed',
      groups: G.map(g => { const st = s.confirm[g.k]; return { label: g.l, irs: $(g.irs), pl: $(g.pl), varc: d$(g.pl - g.irs), tag: 'tag ' + (st === 'fix' ? 'tag-warning' : st ? 'tag-success' : 'tag-neutral'), tagText: st === 'fix' ? 'Correction noted' : st ? 'Confirmed' : 'Not confirmed', confirm: () => ed(p => ({ confirm: { ...p.confirm, [g.k]: 1 } })), confirmDisabled: st === 'fix' || st === 1, correct: () => this.setState({ correcting: g.k, corrAmt: s.corr[g.k] ? s.corr[g.k].amt : String(g.irs), corrReason: s.corr[g.k] ? s.corr[g.k].reason : '' }) }; }),
      correcting: !!cg, corrTitle: cg ? 'Correct ' + cg.l + ' · ' + $(cg.irs) + ' / year on the return' : '', corrAmt: s.corrAmt, setCorrAmt: e => this.setState({ corrAmt: e.target.value }), corrReason: s.corrReason, setCorrReason: e => this.setState({ corrReason: e.target.value }),
      saveCorr: () => { if (s.corrReason.trim().length >= 3) ed(p => ({ corr: { ...p.corr, [p.correcting]: { amt: p.corrAmt, reason: p.corrReason } }, confirm: { ...p.confirm, [p.correcting]: 'fix' }, correcting: null })); }, saveCorrDisabled: s.corrReason.trim().length < 3, cancelCorr: () => this.setState({ correcting: null }),
      canRestore: !!(cg && s.corr[cg.k]), restoreCorr: () => ed(p => { const corr = { ...p.corr }, confirm = { ...p.confirm }; delete corr[p.correcting]; delete confirm[p.correcting]; return { corr, confirm, correcting: null }; }),
      loan: s.loan, toggleLoan: () => ed(p => ({ loan: !p.loan })), released: s.loan ? '$50,000 / mo' : '$0 / mo', dscrLoanOnly: x(e0 / IRS.dsCur) + ' → ' + x(e0 / IRS.dsNew),
      cands: [['ads', 'Google Ads', '$1,520 / month', 'Bank statement, Oct 2026 · recurring card charge. Likely already inside Marketing on the return.', 0], ['pt', 'ADP payroll taxes', '$4,180 / month', 'Bank statement, Oct 2026 · ACH. Answers the payroll taxes question in step 2.', 0], ['nl', 'Northline Capital', '$924 / business day', 'ACH debit. Counted in debt service, not operating costs.', 1]].map(([k, l, amt, note, fin]) => ({ label: l, amt, note, fin: !!fin, canAdd: !fin, added: !!s.cand[k], addLabel: s.cand[k] ? 'Added for review' : 'Add for review', add: () => ed(p => ({ cand: { ...p.cand, [k]: 1 }, ...(k === 'pt' ? { cats: { ...p.cats, ptx: 'conf' } } : {}) })) })),
      streams: s.streams.map((st, si) => { const T = TYPES[st.type] || TYPES.custom, vol = S0.vol[st.id], rv0 = S0.rev[st.id];
        const setF = (j, k) => e => { const v = e.target.value; ed(p => ({ streams: p.streams.map((q, qi) => qi === si ? { ...q, f: q.f.map((f, fj) => fj === j ? { ...f, [k]: v } : f) } : q) })); };
        return { name: st.name, setName: e => { const v = e.target.value; ed(p => ({ streams: p.streams.map((q, qi) => qi === si ? { ...q, name: v } : q) })); }, typeLabel: T[0], removable: !!st.added,
          remove: () => ed(p => ({ streams: p.streams.filter((q, qi) => qi !== si), growth: p.growth.filter(g => g.stream !== st.id), lines: p.lines.map(l => l.link === st.id ? { ...l, beh: 'fixed', link: 'all' } : l), chg: Object.fromEntries(Object.entries(p.chg).filter(([k]) => !k.startsWith('f:' + st.id + ':'))) })),
          facs: st.f.map((f, j) => ({ sep: j > 0, label: f.l, custom: !!f.custom, fixedLabel: !f.custom, setLabel: setF(j, 'l'), val: f.v, setVal: setF(j, 'v'), pre: f.u === '$' ? '$' : '', unit: f.u === '$' ? '' : f.u })),
          addMetric: () => ed(p => ({ streams: p.streams.map((q, qi) => qi === si ? { ...q, f: [...q.f, { l: 'New metric', v: '1', u: 'multiplier', vol: 1, custom: 1 }] } : q) })),
          monthly: $(rv0 / 12) + ' / month', annual: $(rv0), volText: 'Business unit: ' + T[1] + ' · ' + nf(vol, 0) + ' a year' + (vol ? ' · $' + (rv0 / vol).toFixed(2) + ' revenue per ' + T[1] : '') };
      }),
      reconTag: 'tag ' + (Math.abs(S0.tot - IRS.rev) < 1 ? 'tag-success' : 'tag-warning'), reconText: Math.abs(S0.tot - IRS.rev) < 1 ? 'Reconciles to IRS revenue' : 'Differs from IRS revenue by ' + d$(S0.tot - IRS.rev),
      modelText: 'Model total ' + $(S0.tot) + ' against IRS revenue ' + $(IRS.rev),
      newType: s.newType, setNewType: e => this.setState({ newType: e.target.value }), types: Object.entries(TYPES).map(([v, t]) => ({ v, l: t[0] })),
      addStream: () => ed(p => { const T = TYPES[p.newType]; return { streams: [...p.streams, { id: 's' + uid(), name: T[0], type: p.newType, added: 1, f: T[2].map(([l, v, u, vol]) => ({ l, v, u, vol })) }] }; }),
      linkOpts: [...s.streams.map(st => ({ v: st.id, l: st.name })), { v: 'all', l: 'All revenue' }], streamOpts: s.streams.map(st => ({ v: st.id, l: st.name })),
      lines2: s.lines.map(l => ({ label: l.l, group: gLabel[l.g], beh: l.beh, link: l.link, fixed: l.beh === 'fixed',
        setBeh: e => { const v = e.target.value; ed(p => ({ lines: p.lines.map(q => q.id === l.id ? { ...q, beh: v, link: v === 'unit' && q.link === 'all' ? p.streams[0].id : q.link } : q) })); },
        setLink: e => { const v = e.target.value; ed(p => ({ lines: p.lines.map(q => q.id === l.id ? { ...q, link: v, beh: v === 'all' && q.beh === 'unit' ? 'pct' : q.beh } : q) })); },
        rate: eff(l) === 'fixed' ? (l.beh === 'fixed' ? 'Fixed amount' : 'Driver is zero · held fixed') : eff(l) === 'unit' ? '$' + rate[l.id].toFixed(2) + ' per ' + unitWord(stById[l.link]) : (rate[l.id] * 100).toFixed(2) + '% of revenue', base: $(l.base) })),
      itemz: ['cogs', 'oth'].map(g => { const kids = s.lines.filter(l => l.g === g), sum = kids.reduce((q, l) => q + l.base, 0), irs = G.find(q => q.k === g).irs, ok = Math.abs(sum - irs) < 1; return { tag: 'tag ' + (ok ? 'tag-success' : 'tag-warning'), tagText: ok ? 'Balanced' : 'Unallocated ' + $(irs - sum), text: gLabel[g] + ' · ' + kids.length + ' items total ' + $(sum) + ' against ' + $(irs) + ' on the return · ' + kids.filter(l => eff(l) !== 'fixed').length + ' linked to revenue' }; }),
      cats: CATS.map(([k, l]) => { const v = s.cats[k], setC = q => () => ed(p => ({ cats: { ...p.cats, [k]: q } })); return { label: l, name: 'cat-' + k, isConf: v === 'conf', isNa: v === 'na', isHelp: v === 'help', conf: setC('conf'), na: setC('na'), help: setC('help'), tag: 'tag ' + (!v ? 'tag-neutral' : v === 'help' ? 'tag-warning' : 'tag-success'), state: v === 'conf' ? 'Included in another line' : v === 'na' ? 'Not applicable' : v === 'help' ? 'Team will help' : 'Not answered' }; }),
      planStart: s.planStart, setPlanStart: e => { const v = e.target.value; ed({ planStart: v }); }, planStartOpts: ['2026-12', '2027-01', '2027-02', '2027-03', '2027-04'].map(v => { const [y, mo] = v.split('-').map(Number); return { v, l: MN[mo - 1] + ' ' + y }; }),
      monthOpts, removedMsg: !!s.removed, undo: () => ed(p => { const r = p.removed; if (!r) return {}; if (r.id.startsWith('gr:')) return { growth: [...p.growth, r.v], removed: null }; if (r.id.startsWith('na:')) return { acts: [...p.acts, r.v], removed: null }; return { chg: { ...p.chg, [r.id]: r.v }, removed: null }; }),
      secs, procExists: !!s.chg['l:o1'], procLabel: s.chg['l:o1'] ? 'Already proposed' : 'Draft cost comparison', draftProc: () => ed(p => ({ chg: { ...p.chg, 'l:o1': newChg({ dir: 'down', mode: 'abs', val: '0.4', start: '3', setup: '495', note: 'Harbor Payments quote: 1.60% all-in against 2.00% today.' }) } })),
      capText: s.loan ? 'Loan terms v3 release $50,000 a month. Assign it to costs the plan relies on, a reserve, or leave it as cash.' : 'Loan terms are not applied, so there is no released cash to assign.',
      allocTag: 'num tag ' + (allocated > cap ? 'tag-danger' : 'tag-neutral'), allocText: allocated > cap ? 'Over-allocated by ' + $(allocated - cap) + ' / mo' : $(cap - allocated) + ' / mo stays as cash',
      allocRows: s.alloc.map(a => { const up = k => e => { const v = e.target.value; ed(p => ({ alloc: p.alloc.map(q => q.id === a.id ? { ...q, [k]: v } : q) })); }; return { label: a.label, setLabel: up('label'), purpose: a.purpose, setPurpose: up('purpose'), amt: a.amt, setAmt: up('amt'), remove: () => ed(p => ({ alloc: p.alloc.filter(q => q.id !== a.id) })) }; }),
      addAlloc: () => ed(p => ({ alloc: [...p.alloc, { id: uid(), label: 'New allocation', purpose: 'existing', amt: '0' }] })), purpOpts: [['existing', 'Existing cost'], ['planned', 'Planned increment'], ['reserve', 'Reserve'], ['other', 'Other']].map(([v, l]) => ({ v, l })),
      compareRows: [fyRow('Annual NOI', noi0, EP.noi, ER.noi, $, d$), fyRow('Cash after debt / year', e0 - IRS.dsCur, EP.e - ds, ER.e - ds, $, d$), fyRow('Annual EBITDA', e0, EP.e, ER.e, $, d$), fyRow('First-year EBITDA', e0, FP.e, FR.e, $, d$), fyRow('First-year NOI', noi0, FP.noi, FR.noi, $, d$), fyRow('DSCR · current debt', e0 / IRS.dsCur, EP.e / IRS.dsCur, ER.e / IRS.dsCur, x, dx), fyRow('DSCR · saved refinance', e0 / IRS.dsNew, EP.e / IRS.dsNew, ER.e / IRS.dsNew, x, dx), fyRow('First-year DSCR · saved refinance', e0 / IRS.dsNew, FP.e / IRS.dsNew, FR.e / IRS.dsNew, x, dx)],
      compare, waterfall, ramp, payLine: payTop + 'px', payLabel: Math.max(0, payTop - 16) + 'px', payText: 'Monthly payment ' + $(pay), rampText: 'First year ' + $(FV.e) + ' · run-rate ' + $(EV.e),
      verOpts: s.versions.map(q => ({ v: String(q.n), l: 'v' + q.n + ' · ' + q.when + (q.n === s.versions.length ? ' · Current' : '') })), ver: s.ver, setVer: e => this.setState({ ver: e.target.value }), downloadLabel: 'Download PDF v' + s.ver, dirty: s.dirty, pdfSub: 'Harbor Auto Detail LLC · v' + s.ver,
      reviewRows, treat: s.treat, setTreat: e => this.setState({ treat: e.target.value }), recon: s.recon, setRecon: e => this.setState({ recon: e.target.value }), reason: s.reason, setReason: e => this.setState({ reason: e.target.value }),
      approve: () => decide('approved'), reject: () => decide('rejected'), approveDisabled: !(s.sel.length && s.reason.trim() && s.treat !== 'unreconciled' && s.recon.trim()), rejectDisabled: !(s.sel.length && s.reason.trim()), reviewMsg: s.reviewMsg || (s.sel.length ? s.sel.length + ' selected' : 'Select changes to review'),
      attest: s.attest, toggleAttest: () => ed(p => ({ attest: !p.attest })), notes: s.notes, setNotes: e => { const v = e.target.value; ed({ notes: v }); },
      corrections: Object.entries(s.corr).map(([k, c]) => ({ label: gLabel[k] + ' · ' + $(n(c.amt)) + ' against ' + $(G.find(g => g.k === k).irs) + ' on the return', reason: c.reason })), noCorr: !Object.keys(s.corr).length,
      viewP: !rv, viewR: rv, setViewP: () => this.setState({ view: 'proposed' }), setViewR: () => this.setState({ view: 'reviewed' }), metrics,
      targetLabel: x(target), dscrBase: x(d0), dscrAfter: x(d1), dscrNeed: target * ds > EV.e ? 'Needs ' + $(target * ds - EV.e) + ' more EBITDA' : 'Clears ' + x(target),
      dscrState: d1 >= target ? 'Meets goal' : d1 >= 1 ? 'Covers debt' : d1 > 0 ? 'Below 1.00x' : 'Negative', dscrTag: 'tag ' + (d1 >= target ? 'tag-success' : d1 >= 1 ? 'tag-warning' : 'tag-danger'),
      scale: { one: sp(1) + '%', target: sp(target) + '%', before: sp(d0) + '%', after: sp(d1) + '%', fillLeft: Math.min(sp(d0), sp(d1)) + '%', fillWidth: Math.abs(sp(d1) - sp(d0)) + '%', fillColor: d1 >= d0 ? 'var(--color-accent-300)' : 'var(--color-danger-tint)' },
      goalv: { pct: Math.max(0, Math.round(EV.noi / goal * 100)) + '%', of: 'of the ' + $(goal) + ' goal · ' + (rv ? 'reviewed' : 'proposed'), zero: gp(0), goal: gp(goal), cur: gp(noi0), prop: gp(EP.noi), rev: gp(ER.noi), curText: $(noi0), propText: $(EP.noi), revText: $(ER.noi), goalText: $(goal), gapLabel: gap > 0 ? 'Still to find' : 'Above goal by', gapText: $(Math.abs(gap)), gapInk: gap > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
      issues: (s.showAllIssues ? iss : iss.slice(0, 5)).map(it => ({ label: it.label, go: goIssue(it) })), issueCount: String(iss.length), issueTag: 'num tag ' + (iss.length ? 'tag-warning' : 'tag-success'),
      hasMoreIssues: iss.length > 5, moreLabel: s.showAllIssues ? 'Show fewer' : 'Show all ' + iss.length, toggleIssues: () => this.setState(p => ({ showAllIssues: !p.showAllIssues })), noIssues: !iss.length,
    };
  }
}
