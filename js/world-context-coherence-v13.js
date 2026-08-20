(function (root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CronacheWorldContextV13 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const PATCH_VERSION = 1;
  const STYLE_ID = 'cronache-world-context-v13-style';
  const GENERIC_NAMES = new Set(['andrea rossi','elena bianchi','lorenzo conti','giulia ferri','matteo ricci','sara moretti','davide galli','chiara neri']);
  const clean = (v, max = 4000) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const key = v => clean(v, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const arr = v => Array.isArray(v) ? v : [];

  function storyText(context = {}) {
    const story = context.story || context.currentStory || {};
    return clean([
      story.title, story.genre, story.setting, story.desc, story.description, story.prologue, story.depth,
      story.worldBlueprint?.scope?.primaryArea, ...arr(story.worldBlueprint?.scope?.secondaryAreas),
      context.setting, context.idea
    ].filter(Boolean).join(' '), 12000);
  }

  function phaseNumber(messages) {
    const text = arr(messages).map(m => clean(m?.content)).join('\n');
    const match = text.match(/FASE\s*([1-6])\s*\/\s*6/i);
    return match ? Number(match[1]) : 0;
  }

  function section(text, start, stops = []) {
    const pos = text.indexOf(start);
    if (pos < 0) return '';
    const from = pos + start.length;
    let end = text.length;
    stops.forEach(stop => {
      const i = text.indexOf(stop, from);
      if (i >= 0 && i < end) end = i;
    });
    return text.slice(from, end);
  }

  function pipeNames(text) {
    return [...new Set(text.split(/\r?\n/).map(line => clean(line)).filter(Boolean).map(line => line.includes(' | ') ? line.split(' | ')[0] : '').filter(Boolean))];
  }

  function themeFromText(text) {
    const t = key(text);
    if (/banch|banca|credito|cambiat|mercant|lana|finanz|prestito|usura|pegni/.test(t)) return 'finance';
    if (/castell|contea|feudal|cavaliere|nobile|regno|ducato/.test(t)) return 'feudal';
    if (/guerra|militar|esercito|battaglia|assedio/.test(t)) return 'military';
    if (/chiesa|monaster|abbazia|relig|vescovo|culto/.test(t)) return 'religious';
    if (/moderno|contempor|azienda|societa|corporation|startup/.test(t)) return 'modern';
    return 'general';
  }

  function historical(text) {
    const years = [...String(text).matchAll(/\b(\d{3,4})\b/g)].map(m => Number(m[1])).filter(Boolean);
    return years.some(y => y < 1900) || /medioev|rinasc|anno domini|feudal|sacro romano/.test(key(text));
  }

  function contextualFallbackNpcJson(messages) {
    const text = arr(messages).map(m => clean(m?.content, 50000)).join('\n');
    const places = pipeNames(section(text, 'LUOGHI:', ['FAZIONI:', '=== GEOGRAFIA', 'Restituisci:']));
    const factions = pipeNames(section(text, 'FAZIONI:', ['=== GEOGRAFIA', 'Restituisci:']));
    const theme = themeFromText(text);
    const old = historical(text);
    const names = old
      ? ['Matteo Bellandi','Caterina Nerli','Jacopo Alberti','Lucia Guidotti','Piero Salviati','Maddalena Rinuccini','Tommaso Ridolfi','Beatrice Altoviti']
      : ['Marco Bellini','Elena Conti','Luca Rinaldi','Giulia Moretti','Matteo Ferri','Sara Neri','Davide Marini','Chiara Leoni'];
    const roleSets = {
      finance: old ? ['Banchiere e cambiatore','Notaia di fiducia','Fattore di compagnia','Mercante di lana','Agente di credito','Scrivana dei conti','Intermediario tra casate','Esattore e informatore'] : ['Direttore finanziario','Consulente legale','Responsabile crediti','Imprenditrice','Analista finanziario','Contabile','Broker','Funzionaria di vigilanza'],
      feudal: ['Castellano','Notaia di corte','Mercante','Capitano delle guardie','Amministratore del feudo','Dama di casata','Messaggero diplomatico','Cappellana'],
      military: ['Capitano','Quartiermastro','Esploratrice','Diplomatico','Comandante di guarnigione','Medica da campo','Logista','Informatrice'],
      religious: ['Priore','Notaia ecclesiastica','Mercante devoto','Custode','Diplomatico del clero','Badessa','Scrivano','Pellegrina informata'],
      modern: ['Manager','Consulente','Responsabile operativo','Imprenditrice','Analista','Legale','Commercialista','Relazioni istituzionali'],
      general: old ? ['Mercante','Notaia','Artigiano','Amministratrice','Guardia','Notabile','Messaggero','Informatrice'] : ['Professionista','Funzionaria','Imprenditore','Consulente','Tecnica','Manager','Mediatore','Informatrice']
    };
    const roles = roleSets[theme] || roleSets.general;
    const premise = clean(section(text, 'CANONE:', ['FONDAZIONE:', 'LUOGHI:']), 900);
    const npcs = names.map((name, i) => {
      const location = places[i % Math.max(1, places.length)] || '';
      const faction = factions.length ? factions[i % factions.length] : '';
      const role = roles[i % roles.length];
      return {
        name, role, faction, location,
        description: `${role} radicato in ${location || 'questa ambientazione'}, con interessi direttamente collegati al conflitto della campagna.`,
        personality: i % 2 ? 'Pragmatico, riservato e attento alla reputazione.' : 'Ambizioso, lucido e abile nel leggere i rapporti di forza.',
        goal: `Rafforzare la propria posizione nel contesto di ${faction || location || 'questa storia'}.`,
        publicGoal: 'Proteggere il proprio ruolo e mantenere credibilità nella rete locale.',
        privateGoal: 'Ottenere un vantaggio concreto senza esporsi prima del necessario.',
        strategy: 'Usa contatti, scambi, informazioni e obblighi reciproci.',
        resources: theme === 'finance' ? 'Credito, registri, corrispondenti, reputazione e liquidità.' : 'Contatti locali, reputazione, accesso a informazioni e risorse del proprio ruolo.',
        influence: 28 + i * 5,
        knowledge: `Conosce persone, interessi e tensioni legate a ${location || 'l area iniziale'}.`,
        agenda: premise ? `Agisce dentro il canone della campagna: ${premise.slice(0, 180)}.` : 'Agisce quando i propri interessi vengono toccati.',
        leverage: theme === 'finance' ? 'Debiti, crediti, registri e relazioni commerciali.' : 'Relazioni, informazioni e obblighi reciproci.',
        constraints: 'Dipende dagli equilibri politici, economici e sociali del luogo.',
        relationship: 'La relazione con il protagonista nasce dal ruolo, non da un legame casuale.',
        gender: i % 2 ? 'F' : 'M'
      };
    });
    return JSON.stringify({ npcs });
  }

  function isJsonComplete(value) {
    const text = String(value || '').trim();
    const first = text.indexOf('{'), last = text.lastIndexOf('}');
    if (first < 0 || last <= first) return false;
    try { JSON.parse(text.slice(first, last + 1)); return true; } catch (_e) { return false; }
  }

  function patchOllama() {
    const ollama = root.CronacheOllama;
    const proto = ollama?.OllamaCloudClient?.prototype;
    if (!proto || proto.request?.__worldContextV13) return Boolean(proto);
    const previous = proto.request;
    const wrapped = async function(model, messages, config = {}, maxTokens) {
      const phase = phaseNumber(messages);
      if (phase !== 4) return previous.call(this, model, messages, config, maxTokens);
      const fetchImpl = this.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
      const apiId = ollama.normalizeCloudApiId ? ollama.normalizeCloudApiId(model?.apiId || model?.id || model) : clean(model?.apiId || model?.id || model).replace(/:cloud$/i, '').replace(/-cloud$/i, '');
      const endpoints = [...new Set([clean(config.nativeProxy).replace(/\/$/, ''), clean(ollama.OLLAMA_NATIVE_PROXY).replace(/\/$/, ''), 'https://storia-app.vercel.app/api/ollama', 'https://ollama.com/api'].filter(Boolean))];
      const budget = Math.max(4200, Number(maxTokens || config.maxTokens) || 5600);
      const body = { model: apiId, messages, stream: false, think: false, format: 'json', options: { temperature: 0.42, top_p: 0.9, top_k: 40, num_predict: budget } };
      if (fetchImpl && clean(config.apiKey)) {
        for (const base of endpoints) {
          try {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), 65000) : null;
            const response = await fetchImpl(`${base}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${clean(config.apiKey)}` }, body: JSON.stringify(body), signal: controller?.signal });
            if (timer) clearTimeout(timer);
            const data = await response.json().catch(() => ({}));
            const content = clean(data?.message?.content ?? data?.response ?? data?.choices?.[0]?.message?.content, 60000);
            if (response.ok && isJsonComplete(content)) {
              const parsed = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
              if (Array.isArray(parsed.npcs) && parsed.npcs.length >= 6) return { content, model: apiId, apiId, endpoint: `${base}/chat`, data, attemptedModels: [apiId], power: { enabled: false, phase: 4, structured: true, context: 'story-context-v13' } };
            }
          } catch (_e) { }
        }
      }
      return { content: contextualFallbackNpcJson(messages), model: apiId, apiId, endpoint: 'local-contextual-recovery', data: {}, attemptedModels: [apiId], power: { enabled: false, phase: 4, recovered: true, contextual: true, context: 'story-context-v13' } };
    };
    wrapped.__worldContextV13 = true;
    wrapped.__worldContextV13Previous = previous;
    proto.request = wrapped;
    return true;
  }

  function spreadLocations(model) {
    const locations = arr(model?.locations);
    if (locations.length < 3) return model;
    const xs = locations.map(l => Number(l.x)).filter(Number.isFinite), ys = locations.map(l => Number(l.y)).filter(Number.isFinite);
    if (!xs.length || !ys.length) return model;
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    if (w >= 520 && h >= 300) return model;
    const cx = 480, cy = 310, rx = 330, ry = 205;
    locations.forEach((l, i) => {
      const angle = (Math.PI * 2 * i / locations.length) - Math.PI / 2;
      const ring = i % 3 === 0 ? 0.72 : i % 3 === 1 ? 0.9 : 1;
      l.x = Math.round(cx + Math.cos(angle) * rx * ring);
      l.y = Math.round(cy + Math.sin(angle) * ry * ring);
    });
    return model;
  }

  function storyFocus(model, context = {}) {
    const text = key(storyText(context));
    const locations = arr(model?.locations);
    let best = null, bestScore = 0;
    locations.forEach(loc => {
      const parts = [loc.name, loc.region, loc.nation].map(v => key(v)).filter(Boolean);
      let score = 0;
      parts.forEach(p => { if (p.length >= 4 && text.includes(p)) score += p === key(loc.name) ? 4 : 2; });
      if (score > bestScore) { best = loc; bestScore = score; }
    });
    if (!best || bestScore < 2) return null;
    const broad = /\b(tutto il mondo|mondo intero|intera europa|tutta europa|tutta italia|italia intera|scala globale|continente intero)\b/.test(text);
    if (broad) return null;
    return { location: best.name, region: best.region, nation: best.nation, score: bestScore };
  }

  function focusModel(model, context = {}) {
    const focus = storyFocus(model, context);
    if (!focus) return spreadLocations(model);
    const regionKey = key(focus.region), nationKey = key(focus.nation);
    const keep = new Set();
    arr(model.locations).forEach(loc => {
      if ((regionKey && key(loc.region) === regionKey) || key(loc.name) === key(focus.location) || loc.current) keep.add(loc.id);
    });
    if (keep.size < 4 && nationKey) arr(model.locations).forEach(loc => { if (key(loc.nation) === nationKey) keep.add(loc.id); });
    if (keep.size >= 4 && keep.size < model.locations.length) {
      model.allLocations = model.locations.slice();
      model.locations = model.locations.filter(loc => keep.has(loc.id));
      const regions = new Set(model.locations.map(loc => key(loc.region)).filter(Boolean));
      model.regionLabels = arr(model.regionLabels).filter(r => regions.has(key(r.name)));
      model.regionZones = arr(model.regionZones).filter(r => regions.has(key(r.name || r.region)));
      model.routeEdges = arr(model.routeEdges).filter(e => keep.has(e.from) && keep.has(e.to));
      model.liveSignals = arr(model.liveSignals).filter(s => !s.locationId || keep.has(s.locationId));
      model.hostileMarkers = arr(model.hostileMarkers).filter(s => !s.locationId || keep.has(s.locationId));
      model.storyFocus = focus;
    }
    return spreadLocations(model);
  }

  function patchMap() {
    const map = root.CronacheWorldMap;
    if (!map || typeof map.buildMapModel !== 'function' || map.buildMapModel.__worldContextV13) return Boolean(map);
    const previous = map.buildMapModel;
    const wrapped = function(...args) {
      const model = previous.apply(this, args);
      const context = args[2] || root.CronacheWorldMapV10?.runtime?.lastContext?.context || {};
      return model ? focusModel(model, context) : model;
    };
    wrapped.__worldContextV13 = true;
    wrapped.__worldMapV10Wrapped = true;
    map.buildMapModel = wrapped;
    return true;
  }

  function ensureStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '.world-map-story-terrain{opacity:.28!important}.world-map-routes{opacity:.62}.world-map-region-zones{opacity:.32}.world-map-hostile-markers{filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}';
    document.head.appendChild(style);
  }

  function install() {
    const ok1 = patchOllama();
    const ok2 = patchMap();
    ensureStyles();
    root.__cronacheWorldContextV13 = PATCH_VERSION;
    return ok1 || ok2;
  }

  if (typeof document !== 'undefined') {
    const boot = () => { install(); [100, 300, 700, 1400, 2600].forEach(ms => setTimeout(install, ms)); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  }

  return { PATCH_VERSION, phaseNumber, themeFromText, historical, contextualFallbackNpcJson, isJsonComplete, spreadLocations, storyFocus, focusModel, patchOllama, patchMap, install };
});