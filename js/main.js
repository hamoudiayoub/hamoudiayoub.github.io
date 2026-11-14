/* Ayoub Hamoudi · portfolio
   0. language (EN/FR)  1. theme + reveal  2. live Raft cluster
   3. DistDB architecture  4. counters  5. the distdb=> shell                */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* ───────────── 0. language ─────────────
     English lives in index.html. French comes from js/i18n.js, keyed by the
     English innerHTML (whitespace collapsed) of each text block.            */
  const FR = window.I18N_FR || { meta: {}, html: new Map(), attr: new Map() };
  const STR = {
    en: {
      leader: 'leader', follower: 'follower', candidate: 'candidate', dead: 'crashed',
      boot: 'boot: 5 nodes, all followers, term 0',
      stepsDown: (t) => `steps down (term ${t})`,
      timedOut: (t) => `timed out → candidate, term ${t}`,
      elected: (v, n, t) => `elected leader with ${v}/${n} votes · term ${t}`,
      crashedLeader: 'crashed (it was the leader!)',
      crashed: 'crashed (kill -9)',
      restarted: (t) => `restarted, keeps term ${t} from disk`,
      lostQuorum: 'lost its quorum, steps down',
      noQuorum: (a, n) => `no quorum (${a}/${n} up): refusing writes`,
      navLeader: (id, t) => `leader n${id} · term ${t}`,
      navNoQuorum: 'no quorum', navElecting: 'electing…',
      nodeAria: (i, s, t, alive) => alive
        ? `Node ${i}, ${s}, term ${t}. Press to crash it.`
        : `Node ${i}, crashed. Press to restart it.`,
      langBtn: 'Passer en français',
    },
    fr: {
      leader: 'leader', follower: 'suiveur', candidate: 'candidat', dead: 'en panne',
      boot: 'démarrage : 5 nœuds, tous suiveurs, terme 0',
      stepsDown: (t) => `redevient suiveur (terme ${t})`,
      timedOut: (t) => `délai écoulé → candidat, terme ${t}`,
      elected: (v, n, t) => `élu leader avec ${v}/${n} votes · terme ${t}`,
      crashedLeader: 'tombé en panne (c\'était le leader !)',
      crashed: 'tombé en panne (kill -9)',
      restarted: (t) => `redémarré, garde le terme ${t} sur disque`,
      lostQuorum: 'a perdu son quorum, redevient suiveur',
      noQuorum: (a, n) => `pas de quorum (${a}/${n} en ligne) : écritures refusées`,
      navLeader: (id, t) => `leader n${id} · terme ${t}`,
      navNoQuorum: 'pas de quorum', navElecting: 'élection…',
      nodeAria: (i, s, t, alive) => alive
        ? `Nœud ${i}, ${s}, terme ${t}. Appuyez pour le faire tomber.`
        : `Nœud ${i}, en panne. Appuyez pour le redémarrer.`,
      langBtn: 'Switch to English',
    },
  };
  let lang = 'en';
  const t = (k, ...a) => {
    const v = STR[lang][k] !== undefined ? STR[lang][k] : STR.en[k];
    return typeof v === 'function' ? v(...a) : v;
  };

  const I18N_SKIP = '.stack, .marquee, script, style, noscript, [data-count], .shell, #clusterSvg, #clusterLog, #navStatusText, #archK, #archV, .lang, .grain';
  const norm = (h) => h.replace(/\s+/g, ' ').trim();
  const textBlocks = [];
  (function collect(el) {
    if (el.matches(I18N_SKIP)) return;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText) { textBlocks.push({ el, en: el.innerHTML, key: norm(el.innerHTML) }); return; }
    for (const c of el.children) collect(c);
  })(document.body);
  const attrBlocks = [];
  $$('[alt], [aria-label], [title]').forEach((el) => {
    if (el.closest('#clusterSvg, .lang')) return;
    ['alt', 'aria-label', 'title'].forEach((a) => {
      const v = el.getAttribute(a);
      if (v && FR.attr.has(v)) attrBlocks.push({ el, a, en: v });
    });
  });
  const metaDesc = $('meta[name="description"]');
  const EN_META = { title: document.title, description: metaDesc ? metaDesc.content : '' };
  const langListeners = [];
  const onLang = (fn) => langListeners.push(fn);

  function setLang(next, { save = false } = {}) {
    lang = next === 'fr' ? 'fr' : 'en';
    root.lang = lang;
    const fr = lang === 'fr';
    textBlocks.forEach((b) => {
      const v = fr ? FR.html.get(b.key) : null;
      const html = v !== undefined && v !== null ? v : b.en;
      if (b.el.innerHTML !== html) b.el.innerHTML = html;
    });
    attrBlocks.forEach((b) => b.el.setAttribute(b.a, fr ? FR.attr.get(b.en) : b.en));
    document.title = fr && FR.meta.title ? FR.meta.title : EN_META.title;
    if (metaDesc) metaDesc.content = fr && FR.meta.description ? FR.meta.description : EN_META.description;
    const btn = $('#langBtn');
    if (btn) { btn.setAttribute('aria-label', t('langBtn')); btn.setAttribute('aria-pressed', String(fr)); }
    if (save) {
      try { localStorage.setItem('lang', lang); } catch (e) { /* storage blocked */ }
      try {
        const u = new URL(location.href);
        if (fr) u.searchParams.set('lang', 'fr'); else u.searchParams.delete('lang');
        history.replaceState(null, '', u);
      } catch (e) { /* ignore */ }
    }
    langListeners.forEach((fn) => fn(lang));
  }
  function detectLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'fr' || q === 'en') return q;
    try { const s = localStorage.getItem('lang'); if (s === 'fr' || s === 'en') return s; } catch (e) { /* ignore */ }
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    return /^fr\b/i.test(prefs[0] || '') ? 'fr' : 'en';
  }
  setLang(detectLang());
  const langBtn = $('#langBtn');
  if (langBtn) langBtn.addEventListener('click', () => setLang(lang === 'fr' ? 'en' : 'fr', { save: true }));

  /* ───────────── 1. theme + reveal ───────────── */
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

  /* ───────────── 1b. hero flipbook: type, coffee, type ─────────────
     Five risograph frames stacked in .flipbook, all composited onto the same
     background so only the hands, the arm, the mug and the face ever change.
     Typing swaps two frames that differ only in the fingers (hard cuts read as
     keystrokes). The coffee break crossfades reach → lift → sip and back: each
     new pose fades in on top of the previous one, eased, like a motion blur.  */
  (() => {
    const box = $('#flipbook');
    if (!box || reduced) return;
    const F = {};
    $$('.flip', box).forEach((img) => { F[img.dataset.k] = img; });
    let cur = F.typeA, prev = null, visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(box);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const awake = async () => { while (!visible || document.hidden) await wait(300); };

    // cut (fade = 0) or crossfade (fade = ms) to the frame named k
    const retire = (img) => { img.classList.remove('is-prev'); img.style.opacity = ''; img.style.transition = ''; };
    const show = async (k, pose, fade = 0) => {
      box.dataset.pose = pose;
      const img = F[k];
      if (img === cur) return;
      if (prev) retire(prev);
      cur.classList.remove('is-on');
      cur.classList.add('is-prev');
      prev = cur; cur = img;
      img.style.transition = 'none';
      img.style.opacity = '0';
      img.classList.add('is-on');
      if (fade) {
        void img.offsetWidth; // commit opacity 0 before animating
        img.style.transition = `opacity ${fade}ms cubic-bezier(.45, 0, .55, 1)`;
      }
      img.style.opacity = '1';
      // the previous pose stays underneath until the next change, so a fade
      // that the browser pauses (background tab) never shows an empty frame
      if (fade) await wait(fade);
    };
    const load = (img) => new Promise((res) => {
      if (img.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src;
      if (img.complete && img.naturalWidth) return res();
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    });
    const start = async () => {
      const rest = [F.typeB, F.reach, F.lift, F.sip];
      await Promise.all(rest.map(load));
      if (rest.some((i) => !i.naturalWidth)) return; // keep the still frame
      await Promise.all(rest.map((i) => (i.decode ? i.decode().catch(() => {}) : null)));
      await wait(700);
      for (;;) {
        await awake();
        // a burst of typing, with the odd pause to think
        const until = performance.now() + 3200 + Math.random() * 1600;
        let n = 0;
        while (performance.now() < until) {
          await show(n++ % 2 ? 'typeB' : 'typeA', 'type');
          await wait(80 + Math.random() * 120);
          if (Math.random() < 0.06) await wait(380);
        }
        await show('typeA', 'type'); await wait(450);
        // coffee: reach, lift, sip ... and back
        await show('reach', 'reach', 300); await wait(220);
        await show('lift', 'lift', 340); await wait(140);
        await show('sip', 'sip', 360); await wait(1300);
        await show('lift', 'lift', 340); await wait(120);
        await show('reach', 'reach', 300); await wait(180);
        await show('typeA', 'type', 300); await wait(350);
      }
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  })();

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
      if (n.state === 'leader') log(`n${n.id + 1}`, t('stepsDown', n.term));
      n.state = 'follower';
    }
    function startElection(n) {
      n.state = 'candidate'; n.term += 1; n.votedFor = n.id; n.votes = new Set([n.id]);
      resetTimer(n);
      log(`n${n.id + 1}`, t('timedOut', n.term));
      nodes.forEach((m) => { if (m.id !== n.id) send(n.id, m.id, 'rv', n.term); });
    }
    function becomeLeader(n) {
      n.state = 'leader'; n.nextHb = now; n.leaderSince = now; n.lastAck = {};
      log(`n${n.id + 1}`, t('elected', n.votes.size, N, n.term), true);
    }
    function crash(n) {
      const wasLeader = n.state === 'leader';
      n.alive = false; n.state = 'dead';
      log(`n${n.id + 1}`, wasLeader ? t('crashedLeader') : t('crashed'), true);
      render();
    }
    function restart(n) {
      n.alive = true; n.state = 'follower'; n.votes = new Set(); resetTimer(n);
      log(`n${n.id + 1}`, t('restarted', n.term));
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
            if (heard < MAJ) { log(`n${n.id + 1}`, t('lostQuorum'), true); n.state = 'follower'; resetTimer(n); }
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
        n.sub.textContent = n.alive ? `${t(n.state)} · t${n.term}` : t('dead');
        n.g.setAttribute('aria-label', t('nodeAria', n.id + 1, t(n.state), n.term, n.alive));
      });
      const L = leader();
      const alive = aliveCount();
      quorumText.textContent = alive < MAJ ? t('noQuorum', alive, N) : '';
      if (L) {
        navText.textContent = t('navLeader', L.id + 1, L.term);
        navPill.classList.remove('is-down');
      } else {
        navText.textContent = alive < MAJ ? t('navNoQuorum') : t('navElecting');
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
    log('cluster', t('boot'));
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
  const ARCH_FR = {
    client: ['client', 'N\'importe quel client PostgreSQL fonctionne : psql, JDBC, ou le terminal de DistDB, avec coloration syntaxique, complétion par Tab et EXPLAIN ANALYZE affiché en arbre avec une barre de temps par opérateur.'],
    gateway: ['passerelle SQL', 'Une requête peut arriver sur n\'importe quel nœud. Ce nœud l\'analyse, la résout et la planifie avec un optimiseur basé sur les coûts, puis l\'exécute comme une transaction. Filtres, projections et agrégats partiels s\'exécutent directement sur les ranges, et la passerelle fusionne les résultats.'],
    txn: ['transactions Percolator', 'Chaque clé est d\'abord pré-écrite, puis la transaction est validée via un verrou primaire. On obtient une isolation snapshot entre ranges, avec des timestamps de début et de validation fournis par l\'oracle du placement driver. Un GC supprime les anciennes versions.'],
    kv: ['client KV', 'Le client KV garde en cache l\'emplacement de chaque range, suit les redirections vers le leader Raft actuel et relance les requêtes sans risque. Lectures, pré-écritures, validations et fragments SQL délégués passent par gRPC.'],
    store: ['Store : ranges, groupes Raft', 'Chaque nœud de données porte de nombreuses ranges, et chaque range forme son propre groupe Raft de trois répliques. Lectures et écritures passent par le leader de la range, qui confirme son rôle avec ReadIndex. Le pipelining et le batching gardent les requêtes en vol.'],
    lsm: ['moteur LSM', 'Un journal d\'écriture (WAL) avec group commit, des memtables vidées en SSTables, de la compaction et des clés encodées MVCC. Testé aux crashs avec 500 seeds et 2 000 000 d\'opérations de modèle.'],
    pd: ['placement driver ×3', 'Trois nœuds PD, répliqués avec Raft. Ils tiennent l\'annuaire des ranges, font tourner l\'oracle de timestamps (TSO), découpent les ranges qui grossissent, rééquilibrent les répliques et remplacent celles des nœuds qui tombent.'],
    peers: ['autres nœuds de données', 'Faites tomber n\'importe quel nœud, PD ou données, et le cluster continue de répondre. Après un kill -9 du leader le plus chargé, le débit revient à 90 % en 1,1 s, environ un délai d\'élection Raft.'],
  };
  const archNodes = $$('.arch__node');
  const archK = $('#archK'), archV = $('#archV');
  let archActive = archNodes.find((g) => g.dataset.k === 'gateway') || null;
  const showArch = (g) => {
    if (!g) return;
    archActive = g;
    archNodes.forEach((x) => x.classList.toggle('is-active', x === g));
    const [k, v] = (lang === 'fr' ? ARCH_FR : ARCH)[g.dataset.k];
    archK.textContent = k; archV.textContent = v;
  };
  onLang(() => showArch(archActive));
  if (lang === 'fr') showArch(archActive);
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
  const fmtNum = (v, dec) => v.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  onLang(() => $$('[data-count]').forEach((el) => {
    el.textContent = fmtNum(parseFloat(el.dataset.count), +(el.dataset.dec || 0)) + (el.dataset.suffix || '');
  }));
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
      const fr = lang === 'fr';
      html(`<span class="kw">${fr ? 'Commandes' : 'General'}</span>
  \\dt                     ${fr ? 'liste des tables  ' : 'list tables       '} <span class="dim">(${fr ? 'ou' : 'or'} SHOW TABLES)</span>
  \\d <span class="hi">TABLE</span>                ${fr ? 'colonnes d\'une table' : 'columns of a table'}
  \\nodes                  ${fr ? 'le cluster Raft en direct sur cette page' : 'the live Raft cluster on this page'}
  \\x  \\timing  \\conninfo  clear  \\q
<span class="kw">${fr ? 'Essayez' : 'Try'}</span>
  SELECT * FROM experience;
  SELECT * FROM projects;
  SELECT * FROM skills WHERE category = 'ai';
  EXPLAIN ANALYZE SELECT * FROM ayoub;
  BEGIN; … COMMIT;
<span class="dim">${fr ? 'Tab complète · ↑/↓ historique · Échap ferme' : 'Tab completes · ↑/↓ history · Esc closes'}</span>`);
      return;
    }
    if (lc === 'clear' || lc === '\\! clear') { out.innerHTML = ''; return; }
    if (lc === '\\q' || lc === 'exit' || lc === 'quit') { close(); return; }
    if (lc === 'whoami' || lc === 'select current_user') {
      html(lang === 'fr'
        ? '<span class="hi">Ayoub Hamoudi</span> : étudiant en génie logiciel @ INPT Rabat.\nFull-stack · systèmes distribués · cloud · IA/LLM · mobile.'
        : '<span class="hi">Ayoub Hamoudi</span>: software engineering student @ INPT Rabat.\nFull-stack · distributed systems · cloud · AI/LLM · mobile.');
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
        lang === 'fr'
          ? 'ce portfolio est répliqué, pas modifiable. Écrivez plutôt à hamoudiayoub891@gmail.com'
          : 'this portfolio is replicated, not writable. Write to hamoudiayoub891@gmail.com instead');
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
    error(`syntax error at or near "${tok}"`, '42601', lang === 'fr' ? 'tapez \\? pour l\'aide' : 'type \\? for help');
  }

  function submit(cmd) {
    run(cmd);
    if (cmd.trim()) { hist.push(cmd); }
    hIdx = hist.length;
    setPrompt(); scroll();
  }

  function boot() {
    booted = true;
    const fr = lang === 'fr';
    line('dim', fr ? 'distdb sql 1.0 · connecté à 127.0.0.1:5433 · base "ayoub"' : 'distdb sql 1.0 · connected to 127.0.0.1:5433 · database "ayoub"');
    line('dim', fr ? 'Parle le protocole PostgreSQL (quelques tables, en lecture seule). Tapez \\? pour l\'aide.' : 'Speaks the PostgreSQL protocol (a few tables, read-only). Type \\? for help.');
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
