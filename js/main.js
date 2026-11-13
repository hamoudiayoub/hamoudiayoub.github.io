/* Ayoub Hamoudi · portfolio
   1. theme + reveal  2. live Raft cluster  3. DistDB architecture
   4. counters        5. the distdb=> shell                                  */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ───────────── 1. theme + reveal ───────────── */
  const root = document.documentElement;
  const isDark = () => root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  $('#themeBtn').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked */ }
  });

  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach((el) => revealIO.observe(el));

  /* ───────────── 2. live Raft cluster ───────────── */
  const Raft = (() => {
    const svg = $('#clusterSvg');
    const logEl = $('#clusterLog');
    const navPill = $('#navStatus');
    const navText = $('#navStatusText');
    if (!svg) return null;

    const NS = 'http://www.w3.org/2000/svg';
    const N = 5, MAJ = 3, NODE_R = 24, TIMER_R = 31;
    // Raft needs broadcast time << election timeout; MSG is slow on purpose so the dots are visible.
    const HB = 600, MSG = 420, EMIN = 1700, EMAX = 3400;
    const first = Math.floor(Math.random() * N);
    const C = 2 * Math.PI * TIMER_R;
    const mk = (tag, attrs = {}, parent) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      if (parent) parent.appendChild(el);
      return el;
    };
    const rnd = (a, b) => a + Math.random() * (b - a);

    let now = 0;           // simulated clock (ms); only advances while visible
    let startedAt = 0;
    const pos = Array.from({ length: N }, (_, i) => {
      const a = (-90 + i * 72) * Math.PI / 180;
      return { x: 260 + 200 * Math.cos(a), y: 158 + 112 * Math.sin(a) };
    });

    // edges
    const gEdges = mk('g', {}, svg);
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      mk('line', { x1: pos[i].x, y1: pos[i].y, x2: pos[j].x, y2: pos[j].y, class: 'c-edge' }, gEdges);
    }
    const gMsgs = mk('g', {}, svg);
    const quorumText = mk('text', { x: 260, y: 162, class: 'c-quorum' }, svg);
    const gNodes = mk('g', {}, svg);

    const nodes = pos.map((p, i) => {
      const g = mk('g', { class: 'cn', transform: `translate(${p.x} ${p.y})`, tabindex: '0', role: 'button' }, gNodes);
      const timer = mk('circle', { r: TIMER_R, class: 'cn__timer', transform: 'rotate(-90)' }, g);
      mk('circle', { r: NODE_R, class: 'cn__ring' }, g);
      mk('path', { d: 'M-9 -44 L-9 -33 L9 -33 L9 -44 L4.5 -38.5 L0 -45 L-4.5 -38.5 Z', class: 'cn__crown' }, g);
      mk('path', { d: 'M-8 -8 L8 8 M8 -8 L-8 8', class: 'cn__x' }, g);
      const label = mk('text', { class: 'cn__label', y: 0 }, g); label.textContent = `n${i + 1}`;
      const sub = mk('text', { class: 'cn__sub', y: 48 }, g);
      const n = {
        id: i, g, timer, sub, alive: true, state: 'follower', term: 0, votedFor: null,
        votes: new Set(), nextHb: 0, leaderSince: 0, lastAck: {},
        // one node times out early so visitors see an election right away
        deadline: i === first ? rnd(500, 800) : rnd(1800, 3600), tlen: i === first ? 800 : 3600,
      };
      const toggle = () => (n.alive ? crash(n) : restart(n));
      g.addEventListener('click', toggle);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      return n;
    });

    let msgs = [];
    const send = (from, to, type, term) => {
      const el = mk('circle', { r: type === 'ack' ? 3 : 4.6, class: `c-msg--${type}`, cx: pos[from].x, cy: pos[from].y }, gMsgs);
      msgs.push({ from, to, type, term, t0: now, el });
    };

    const fmtT = () => `t+${((now - startedAt) / 1000).toFixed(1)}s`;
    const log = (who, text, red) => {
      const li = document.createElement('li');
      if (red) li.className = 'is-red';
      const t = document.createElement('span'); t.className = 't'; t.textContent = fmtT();
      const b = document.createElement('b'); b.textContent = who;
      li.append(t, b, document.createTextNode(' ' + text));
      logEl.prepend(li);
      while (logEl.children.length > 7) logEl.lastChild.remove();
    };

    const resetTimer = (n) => { n.tlen = rnd(EMIN, EMAX); n.deadline = now + n.tlen; };
    const aliveCount = () => nodes.filter((n) => n.alive).length;
    const leader = () => nodes.find((n) => n.alive && n.state === 'leader');

    function becomeFollower(n, term) {
      if (term > n.term) { n.term = term; n.votedFor = null; }
      if (n.state === 'leader') log(`n${n.id + 1}`, `steps down (term ${n.term})`);
      n.state = 'follower';
    }
    function startElection(n) {
      n.state = 'candidate'; n.term += 1; n.votedFor = n.id; n.votes = new Set([n.id]);
      resetTimer(n);
      log(`n${n.id + 1}`, `timed out → candidate, term ${n.term}`);
      nodes.forEach((m) => { if (m.id !== n.id) send(n.id, m.id, 'rv', n.term); });
    }
    function becomeLeader(n) {
      n.state = 'leader'; n.nextHb = now; n.leaderSince = now; n.lastAck = {};
      log(`n${n.id + 1}`, `elected leader with ${n.votes.size}/${N} votes · term ${n.term}`, true);
    }
    function crash(n) {
      const wasLeader = n.state === 'leader';
      n.alive = false; n.state = 'dead';
      log(`n${n.id + 1}`, wasLeader ? 'crashed (it was the leader!)' : 'crashed (kill -9)', true);
      render();
    }
    function restart(n) {
      n.alive = true; n.state = 'follower'; n.votes = new Set(); resetTimer(n);
      log(`n${n.id + 1}`, `restarted, keeps term ${n.term} from disk`);
      render();
    }

    function deliver(m) {
      const n = nodes[m.to];
      if (!n.alive) return;
      switch (m.type) {
        case 'hb':
          if (m.term >= n.term) {
            if (n.state !== 'follower' || m.term > n.term) becomeFollower(n, m.term);
            resetTimer(n);
            send(n.id, m.from, 'ack', n.term);
          }
          break;
        case 'rv':
          if (m.term > n.term) becomeFollower(n, m.term);
          if (m.term === n.term && n.state !== 'leader' && (n.votedFor === null || n.votedFor === m.from)) {
            n.votedFor = m.from; resetTimer(n);
            send(n.id, m.from, 'vote', n.term);
          }
          break;
        case 'vote':
          if (n.state === 'candidate' && m.term === n.term) {
            n.votes.add(m.from);
            if (n.votes.size >= MAJ) becomeLeader(n);
          }
          break;
        case 'ack':
          if (m.term > n.term) becomeFollower(n, m.term);
          else if (n.state === 'leader') n.lastAck[m.from] = now;
          break;
      }
    }

    function tick() {
      nodes.forEach((n) => {
        if (!n.alive) return;
        if (n.state === 'leader') {
          if (now >= n.nextHb) {
            nodes.forEach((m) => { if (m.id !== n.id) send(n.id, m.id, 'hb', n.term); });
            n.nextHb = now + HB;
          }
          // CheckQuorum: a leader that can't hear from a majority steps down.
          const window = 2 * HB + 2 * MSG;
          if (now - n.leaderSince > window) {
            const heard = 1 + Object.values(n.lastAck).filter((t) => now - t < window).length;
            if (heard < MAJ) { log(`n${n.id + 1}`, 'lost its quorum, steps down', true); n.state = 'follower'; resetTimer(n); }
          }
        } else if (now >= n.deadline) {
          startElection(n);
        }
      });
      // move messages; deliver the ones that arrived after the sweep, because
      // delivering can send new messages (votes, acks) that must not be lost
      const arrived = [];
      msgs = msgs.filter((m) => {
        const p = (now - m.t0) / MSG;
        if (p >= 1) { m.el.remove(); arrived.push(m); return false; }
        const a = pos[m.from], b = pos[m.to];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        const s = NODE_R / d, e = p * (1 - 2 * s) + s;
        m.el.setAttribute('cx', a.x + dx * e);
        m.el.setAttribute('cy', a.y + dy * e);
        if (!nodes[m.to].alive && p > 0.55) m.el.setAttribute('opacity', (1 - p) * 2);
        return true;
      });
      arrived.forEach(deliver);
    }

    function render() {
      nodes.forEach((n) => {
        n.g.setAttribute('class', `cn is-${n.state}`);
        const remaining = n.alive && n.state !== 'leader' ? Math.max(0, (n.deadline - now) / n.tlen) : 0;
        n.timer.setAttribute('stroke-dasharray', `${C * remaining} ${C}`);
        n.sub.textContent = n.alive ? `${n.state} · t${n.term}` : 'crashed';
        n.g.setAttribute('aria-label', `Node ${n.id + 1}, ${n.alive ? n.state + ', term ' + n.term : 'crashed'}. Press to ${n.alive ? 'crash' : 'restart'} it.`);
      });
      const L = leader();
      const alive = aliveCount();
      quorumText.textContent = alive < MAJ ? `no quorum (${alive}/${N} up): refusing writes` : '';
      if (L) {
        navText.textContent = `leader n${L.id + 1} · term ${L.term}`;
        navPill.classList.remove('is-down');
      } else {
        navText.textContent = alive < MAJ ? 'no quorum' : 'electing…';
        navPill.classList.add('is-down');
      }
    }

    let visible = true, last = performance.now();
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(svg);
    function frame(t) {
      const dt = Math.min(50, t - last); last = t;
      if (visible && !document.hidden) { now += dt; tick(); render(); }
      requestAnimationFrame(frame);
    }
    log('cluster', 'boot: 5 nodes, all followers, term 0');
    render();
    requestAnimationFrame(frame);

    return {
      snapshot: () => nodes.map((n) => ({ id: n.id + 1, state: n.alive ? n.state : 'crashed', term: n.term, votedFor: n.votedFor === null ? '' : `n${n.votedFor + 1}` })),
    };
  })();

  /* ───────────── 3. DistDB architecture ───────────── */
  const ARCH = {
    client: ['client', 'Any PostgreSQL client works: psql, JDBC, or DistDB\'s own shell, which has syntax highlighting, tab completion and EXPLAIN ANALYZE drawn as a tree with a time bar per operator.'],
    gateway: ['SQL gateway', 'A statement can arrive at any node. That node parses, binds and plans it with a cost-based optimizer, then runs it as a transaction. Filters, projections and partial aggregates run on the ranges themselves, and the gateway merges what comes back.'],
    txn: ['Percolator transactions', 'Every key is prewritten, then the transaction commits through a primary lock. This gives snapshot isolation across ranges, with start and commit timestamps from the placement driver\'s oracle. A GC worker drops old versions.'],
    kv: ['KV client', 'The KV client caches where each range lives, follows redirects to the current Raft leader and retries safely. Reads, prewrites, commits and pushed-down SQL fragments go over gRPC.'],
    store: ['Store: ranges, Raft groups', 'Each data node holds many ranges, and each range is its own three-replica Raft group. Reads and writes go to the range leader, which confirms its leadership with ReadIndex. Pipelining and batching keep requests in flight.'],
    lsm: ['LSM engine', 'A write-ahead log with group commit, memtables flushed to SSTables, compaction and MVCC-encoded keys. It was crash-tested with 500 seeds and 2,000,000 model operations.'],
    pd: ['Placement driver ×3', 'Three PD nodes, replicated with Raft. They keep the range directory, run the timestamp oracle (TSO), split ranges that grow, rebalance replicas and replace the replicas of nodes that die.'],
    peers: ['other data nodes', 'Kill any node, PD or data, and the cluster keeps serving. After a kill -9 of the busiest leader, throughput is back to 90% within 1.1 s, roughly one Raft election timeout.'],
  };
  const archNodes = $$('.arch__node');
  const archK = $('#archK'), archV = $('#archV');
  const showArch = (g) => {
    archNodes.forEach((x) => x.classList.toggle('is-active', x === g));
    const [k, v] = ARCH[g.dataset.k];
    archK.textContent = k; archV.textContent = v;
  };
  archNodes.forEach((g) => {
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.addEventListener('mouseenter', () => showArch(g));
    g.addEventListener('focus', () => showArch(g));
    g.addEventListener('click', () => showArch(g));
  });
  const gw = archNodes.find((g) => g.dataset.k === 'gateway');
  if (gw) gw.classList.add('is-active');

  /* ───────────── 4. counters ───────────── */
  const fmtNum = (v, dec) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      countIO.unobserve(e.target);
      const el = e.target, to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || '';
      if (reduced) { el.textContent = fmtNum(to, dec) + suf; return; }
      const t0 = performance.now(), dur = 1400;
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur), k = 1 - Math.pow(1 - p, 3);
        el.textContent = fmtNum(to * k, dec) + suf;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach((el) => {
    el.textContent = fmtNum(parseFloat(el.dataset.count), +(el.dataset.dec || 0)) + (el.dataset.suffix || '');
    countIO.observe(el);
  });

  /* ───────────── 5. the distdb=> shell ───────────── */
  const shell = $('#shell'), out = $('#shellOut'), form = $('#shellForm'), input = $('#shellInput'),
    promptEl = $('#shellPrompt'), chips = $('#shellChips');
  let opener = null, booted = false, inTxn = false, inErr = false, timing = true, expanded = false;
  const hist = []; let hIdx = 0;

  const TABLES = {
    experience: {
      cols: ['idx', 'company', 'role', 'period', 'highlight'],
      rows: [
        [3, 'B2BLink', 'Software Engineer Intern', '2026-07 → 2026-08', 'SmartAlert: Node.js extraction, Spring Boot, WebSockets'],
        [2, 'AGH Data Agency Holding', 'LLM Developer (freelance)', '2026-06', '3 fully local LLM apps: Llama 3.2, Qwen2.5, Flutter'],
        [1, 'CMR Open Lab', 'Software Engineer Intern', '2026-03 → 2026-05', 'Senior-Aidant: Design Thinking, 2 user tests'],
      ],
    },
    projects: {
      cols: ['name', 'kind', 'stack', 'status'],
      rows: [
        ['DistDB', 'distributed SQL database', 'Java 25 · Raft · gRPC · LSM', '10/10 phases done'],
        ['SmartAlert', 'offer alert platform', 'Node.js · Spring Boot · React', 'live'],
        ['Senior-Aidant', 'senior-care app', 'React Native · Expo', 'prototype, user-tested'],
        ['Esthétique AI', 'skin diagnostics', 'Flask · Llama 3.2 · OpenCV', 'delivered'],
        ['APK Coiffure', 'hair advice', 'FastAPI · Qwen2.5 · MediaPipe · Flutter', 'delivered'],
        ['Coach Fitness & Recettes', 'fitness + recipes', 'Django · Qwen2.5 · Flutter', 'delivered'],
        ['HireFlow ATS', 'AI applicant tracking', 'React · Node · MySQL · LLM', 'shipped'],
        ['Travelo', 'cloud orchestration', 'Docker · Swarm · Kubernetes', 'done'],
        ['OrientLamp', 'orientation platform', 'Spring Boot · React · Docker', 'v1 delivered'],
        ['AutoExam', 'desktop exam app', 'Java · JavaFX · MySQL', 'done'],
      ],
    },
    skills: {
      cols: ['category', 'items'],
      rows: [
        ['languages', 'Java, Python, TypeScript, JavaScript, Dart, SQL'],
        ['distributed', 'Raft, gRPC, Percolator, LSM trees, Docker, Kubernetes, Prometheus, Grafana'],
        ['backend', 'Spring Boot, FastAPI, Django, Flask, Node · Express'],
        ['mobile', 'Flutter, React Native · Expo'],
        ['web', 'React, Next.js, Tailwind, SASS'],
        ['data', 'PostgreSQL, MySQL, MongoDB, Redis'],
        ['ai', 'Qwen2.5, Llama 3.2, Ollama, Gemini, MediaPipe, OpenCV, OpenRouter'],
      ],
    },
    education: {
      cols: ['school', 'program', 'note'],
      rows: [
        ['INPT, Rabat', 'Advanced Software Engineering for Digital Services', 'engineering cycle'],
        ['CPGE, Marrakech', 'PSI (physics & engineering sciences)', 'ranked 12th nationally (CNC)'],
      ],
    },
    contact: {
      cols: ['channel', 'value'],
      rows: [
        ['email', { href: 'mailto:hamoudiayoub891@gmail.com', text: 'hamoudiayoub891@gmail.com' }],
        ['linkedin', { href: 'https://www.linkedin.com/in/ayoub-hamoudi-1a259b375/', text: 'in/ayoub-hamoudi-1a259b375' }],
        ['github', { href: 'https://github.com/hamoudiayoub', text: 'github.com/hamoudiayoub' }],
      ],
    },
  };
  TABLES.nodes = null; // live, from the Raft cluster

  const KEYWORDS = ['SELECT', '*', 'FROM', 'WHERE', 'experience', 'projects', 'skills', 'education', 'contact', 'nodes',
    'EXPLAIN', 'ANALYZE', 'ayoub', 'SHOW', 'TABLES', 'NODES', 'BEGIN', 'COMMIT', 'ROLLBACK', 'whoami', 'help', 'clear',
    '\\dt', '\\d', '\\nodes', '\\conninfo', '\\timing', '\\x', '\\q', '\\?'];

  const line = (cls, text) => {
    const div = document.createElement('div');
    if (cls) div.className = cls;
    if (text !== undefined) div.textContent = text;
    out.appendChild(div);
    return div;
  };
  const html = (markup) => { const div = document.createElement('div'); div.innerHTML = markup; out.appendChild(div); return div; };
  const scroll = () => { out.scrollTop = out.scrollHeight; };
  const ms = () => (0.3 + Math.random() * 1.6).toFixed(2);
  const prompt = () => (inErr ? 'distdb!>' : inTxn ? 'distdb*>' : 'distdb=>');
  const setPrompt = () => { promptEl.textContent = prompt(); };

  function table(cols, rows) {
    if (expanded) {
      rows.forEach((r, i) => {
        line('dim', `-[ RECORD ${i + 1} ]` + '-'.repeat(24));
        cols.forEach((c, j) => {
          const d = line();
          const k = document.createElement('span'); k.className = 'kw'; k.textContent = c.padEnd(12) + '│ ';
          d.append(k, cell(r[j]));
        });
      });
    } else {
      const t = document.createElement('table');
      const tr = document.createElement('tr');
      cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; tr.appendChild(th); });
      t.appendChild(tr);
      rows.forEach((r) => {
        const row = document.createElement('tr');
        r.forEach((v) => {
          const td = document.createElement('td');
          if (typeof v === 'number') td.className = 'n';
          td.appendChild(cell(v));
          row.appendChild(td);
        });
        t.appendChild(row);
      });
      out.appendChild(t);
    }
    line('dim', `(${rows.length} row${rows.length === 1 ? '' : 's'}${timing ? `, ${ms()} ms` : ''})`);
  }
  function cell(v) {
    if (v && typeof v === 'object') {
      const a = document.createElement('a'); a.href = v.href; a.textContent = v.text; a.className = 'hi';
      if (!v.href.startsWith('mailto:')) { a.target = '_blank'; a.rel = 'noopener'; }
      return a;
    }
    return document.createTextNode(v === null || v === undefined ? '' : String(v));
  }
  function error(msg, state, hint) {
    line('err', `ERROR:  ${msg}`);
    line('dim', `SQLSTATE ${state}${hint ? `  ·  HINT: ${hint}` : ''}`);
    inErr = true;
  }
  function getTable(name) {
    if (name === 'nodes') {
      return { cols: ['node', 'role', 'term', 'voted_for'], rows: Raft ? Raft.snapshot().map((n) => [`n${n.id}`, n.state, n.term, n.votedFor]) : [] };
    }
    return TABLES[name];
  }

  function run(raw) {
    const echo = line();
    const p = document.createElement('span'); p.className = 'p'; p.textContent = prompt() + ' ';
    const c = document.createElement('span'); c.className = 'cmd'; c.textContent = raw;
    echo.append(p, c);

    const q = raw.trim().replace(/;+\s*$/, '').trim();
    const lc = q.toLowerCase().replace(/\s+/g, ' ');
    if (!q) return;
    inErr = false;

    if (lc === 'help' || lc === '\\?' || lc === '?' || lc === '\\h') {
      html(`<span class="kw">General</span>
  \\dt                     list tables        <span class="dim">(or SHOW TABLES)</span>
  \\d <span class="hi">TABLE</span>                columns of a table
  \\nodes                  the live Raft cluster on this page
  \\x  \\timing  \\conninfo  clear  \\q
<span class="kw">Try</span>
  SELECT * FROM experience;
  SELECT * FROM projects;
  SELECT * FROM skills WHERE category = 'ai';
  EXPLAIN ANALYZE SELECT * FROM ayoub;
  BEGIN; … COMMIT;
<span class="dim">Tab completes · ↑/↓ history · Esc closes</span>`);
      return;
    }
    if (lc === 'clear' || lc === '\\! clear') { out.innerHTML = ''; return; }
    if (lc === '\\q' || lc === 'exit' || lc === 'quit') { close(); return; }
    if (lc === 'whoami' || lc === 'select current_user') {
      html('<span class="hi">Ayoub Hamoudi</span>: software engineering student @ INPT Rabat.\nDistributed systems · cloud · AI/LLM · mobile.');
      return;
    }
    if (lc === '\\conninfo') {
      line('', 'You are connected to database "ayoub" as user "visitor" on host "127.0.0.1" at port "5433".');
      line('dim', 'Replicas: 3 · isolation: snapshot · password: none needed for good intentions');
      return;
    }
    if (lc === '\\timing') { timing = !timing; line('', `Timing is ${timing ? 'on' : 'off'}.`); return; }
    if (lc === '\\x') { expanded = !expanded; line('', `Expanded display is ${expanded ? 'on' : 'off'}.`); return; }
    if (lc === 'begin' || lc === 'start transaction') {
      if (inTxn) line('dim', 'WARNING:  there is already a transaction in progress');
      inTxn = true; line('ok', 'BEGIN'); return;
    }
    if (lc === 'commit' || lc === 'end') {
      if (!inTxn) line('dim', 'WARNING:  there is no transaction in progress');
      else { line('ok', 'COMMIT'); line('dim', 'prewrite → primary commit → secondaries: replicated on 3/3 replicas'); }
      inTxn = false; return;
    }
    if (lc === 'rollback' || lc === 'abort') { inTxn = false; line('ok', 'ROLLBACK'); return; }
    if (/^(insert|update|delete|drop|truncate|alter|create)\b/.test(lc)) {
      error(`cannot execute ${q.split(/\s+/)[0].toUpperCase()} in a read-only transaction`, '25006',
        'this portfolio is replicated, not writable. Write to hamoudiayoub891@gmail.com instead');
      return;
    }
    if (lc === '\\dt' || lc === 'show tables') {
      table(['schema', 'name', 'rows'], [
        ['public', 'experience', 3], ['public', 'projects', TABLES.projects.rows.length], ['public', 'skills', TABLES.skills.rows.length],
        ['public', 'education', 2], ['public', 'contact', 3], ['system', 'nodes', 5],
      ]);
      return;
    }
    if (lc === '\\nodes' || lc === 'show nodes') { const t = getTable('nodes'); table(t.cols, t.rows); return; }
    let m = lc.match(/^\\d\s+(\w+)$/);
    if (m) {
      const t = getTable(m[1]);
      if (!t) return error(`relation "${m[1]}" does not exist`, '42P01', 'try \\dt');
      table(['column', 'type'], t.cols.map((c, i) => [c, typeof t.rows[0]?.[i] === 'number' ? 'INT' : 'TEXT']));
      return;
    }
    if (/^explain( analyze)? select \* from ayoub$/.test(lc)) {
      html(`<span class="kw">Gather</span>  <span class="dim">(actual rows=1 loops=1)</span>                               <span class="bar">██████████</span> 100%
  └─ <span class="kw">Hash Join</span>  <span class="dim">(cond: curiosity = persistence)</span>
       ├─ <span class="kw">Index Scan</span> on cpge_psi_marrakech  <span class="dim">(rank = 12/national)</span>  <span class="bar">███</span>      28%
       ├─ <span class="kw">Seq Scan</span> on inpt_aseds                                     <span class="bar">██</span>       19%
       └─ <span class="kw">Parallel Scan</span> on internships_2026  <span class="dim">(cmr, agh, b2blink)</span>  <span class="bar">██</span>       21%
  └─ <span class="kw">Pushdown Aggregate</span> on distdb  <span class="dim">(10 phases, 5,000 seeds)</span>    <span class="bar">███</span>      32%
<span class="dim">Planning: 1 coffee · Execution: still running</span>`);
      return;
    }
    m = lc.match(/^select (.+?) from (\w+)(?: where (\w+) ?= ?'([^']*)')?$/);
    if (m) {
      const [, what, name, wcol, wval] = m;
      const t = getTable(name);
      if (!t) return error(`relation "${name}" does not exist`, '42P01', 'try \\dt');
      let rows = t.rows;
      if (wcol) {
        const ci = t.cols.indexOf(wcol);
        if (ci < 0) return error(`column "${wcol}" does not exist`, '42703', `columns: ${t.cols.join(', ')}`);
        rows = rows.filter((r) => String(typeof r[ci] === 'object' ? r[ci].text : r[ci]).toLowerCase() === wval);
      }
      if (/^count\(\*\)$/.test(what)) { table(['count'], [[rows.length]]); return; }
      if (what === '*') { table(t.cols, rows); return; }
      const want = what.split(',').map((s) => s.trim());
      const idx = want.map((w) => t.cols.indexOf(w));
      const bad = want.find((w, i) => idx[i] < 0);
      if (bad) return error(`column "${bad}" does not exist`, '42703', `columns: ${t.cols.join(', ')}`);
      table(want, rows.map((r) => idx.map((i) => r[i])));
      return;
    }
    const tok = q.split(/\s+/)[0];
    error(`syntax error at or near "${tok}"`, '42601', 'type \\? for help');
  }

  function submit(cmd) {
    run(cmd);
    if (cmd.trim()) { hist.push(cmd); }
    hIdx = hist.length;
    setPrompt(); scroll();
  }

  function boot() {
    booted = true;
    line('dim', 'distdb sql 1.0 · connected to 127.0.0.1:5433 · database "ayoub"');
    line('dim', 'Speaks the PostgreSQL protocol (a few tables, read-only). Type \\? for help.');
    line('', '');
    ['\\?', 'SELECT * FROM experience;', 'SELECT * FROM projects;', '\\nodes', 'EXPLAIN ANALYZE SELECT * FROM ayoub;', 'SELECT * FROM contact;']
      .forEach((c) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = c;
        b.addEventListener('click', () => { submit(c); input.focus(); });
        chips.appendChild(b);
      });
  }
  function open(e) {
    opener = (e && e.currentTarget) || document.activeElement;
    shell.hidden = false;
    document.body.style.overflow = 'hidden';
    if (!booted) boot();
    setPrompt();
    setTimeout(() => input.focus(), 30);
  }
  function close() {
    shell.hidden = true;
    document.body.style.overflow = '';
    if (opener && opener.focus) opener.focus();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; submit(v); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { if (hIdx > 0) { hIdx--; input.value = hist[hIdx]; } e.preventDefault(); }
    else if (e.key === 'ArrowDown') { if (hIdx < hist.length) { hIdx++; input.value = hist[hIdx] || ''; } e.preventDefault(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const parts = input.value.split(/(\s+)/);
      const lastTok = parts[parts.length - 1];
      if (!lastTok) return;
      const hits = KEYWORDS.filter((k) => k.toLowerCase().startsWith(lastTok.toLowerCase()));
      if (hits.length === 1) { parts[parts.length - 1] = hits[0] + ' '; input.value = parts.join(''); }
      else if (hits.length > 1) { line('dim', hits.join('   ')); scroll(); }
    }
  });
  $('#shellBtn').addEventListener('click', open);
  $$('[data-open-shell]').forEach((b) => b.addEventListener('click', open));
  $('#shellClose').addEventListener('click', close);
  shell.addEventListener('mousedown', (e) => { if (e.target === shell) close(); });
  document.addEventListener('keydown', (e) => {
    if (!shell.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab' && document.activeElement !== input) {
        // keep focus inside the dialog
        const f = $$('button, input, a[href]', shell);
        if (!f.includes(document.activeElement)) { e.preventDefault(); input.focus(); }
      }
      return;
    }
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); open(); }
  });
})();
