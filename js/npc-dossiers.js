(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheNpcDossiers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const STYLE_ID = 'cronache-npc-dossiers-style';
    const MODAL_ID = 'modal-npc-dossier';
    const BODY_ID = 'npc-dossier-body';

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 700) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 400).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    let observer = null;

    function getState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function isSameName(left, right) {
        const a = keyOf(left);
        const b = keyOf(right);
        if (!a || !b) return false;
        if (a === b) return true;
        const aa = a.split('-').filter(Boolean);
        const bb = b.split('-').filter(Boolean);
        if (aa.length !== 1 && bb.length !== 1) return false;
        const short = aa.length === 1 ? aa[0] : bb[0];
        const long = aa.length === 1 ? bb : aa;
        return short.length >= 3 && long.includes(short);
    }

    function photoApi() {
        return root.CronachePortraitPhotos || null;
    }

    function portraitApi() {
        return root.CronachePortraits || null;
    }

    function findEntity(name, state = getState()) {
        if (!clean(name, 120) || !state) return null;
        const fromPhotos = photoApi()?.findEntity?.(name, state);
        if (fromPhotos) return fromPhotos;
        const memory = state.worldMemory || {};
        const rows = [
            state.character,
            ...asArray(memory?.world?.actors),
            ...asArray(memory.npcs),
            ...asArray(memory.employees),
            ...asArray(memory.family),
            ...asArray(memory?.kingdom?.council)
        ].filter(Boolean);
        return rows.find(item => isSameName(item?.name, name)) || null;
    }

    function findAgent(name, state = getState()) {
        const agents = asArray(state?.worldMemory?.managementAgents?.agents);
        return agents.find(agent => isSameName(agent?.name, name)) || null;
    }

    function dispositionLabel(value) {
        const key = keyOf(value);
        if (/hostile|ostil|enemy|nemic/.test(key)) return 'Ostile';
        if (/wary|guarded|prud|diffident/.test(key)) return 'Prudente';
        if (/aligned|ally|alleat|collabor/.test(key)) return 'Collaborativo';
        if (/pragmatic|pragmatico/.test(key)) return 'Pragmatico';
        if (/friend|amic/.test(key)) return 'Amichevole';
        if (/rival|compet/.test(key)) return 'Rivale';
        return clean(value, 60) || 'Neutrale';
    }

    function roleLabel(role) {
        const key = keyOf(role);
        const labels = {
            customer: 'Cliente', supplier: 'Fornitore', employee: 'Dipendente', competitor: 'Concorrente',
            contractor: 'Controparte', council: 'Consigliere', diplomatic: 'Diplomatico', faction: 'Fazione'
        };
        return labels[key] || clean(role, 100) || 'Personaggio';
    }

    function latestKnownMemories(agent, entity, limit = 3) {
        const memories = asArray(agent?.memories).slice(-Math.max(1, limit)).map(item => clean(item?.text || item, 220)).filter(Boolean);
        if (memories.length) return memories;
        return asArray(entity?.interactions).slice(-Math.max(1, limit)).map(item => clean(item?.summary || item?.text || item?.description || item, 220)).filter(Boolean);
    }

    function buildDossier(entityOrName, state = getState()) {
        const entity = typeof entityOrName === 'object' && entityOrName
            ? entityOrName
            : findEntity(entityOrName, state);
        if (!entity || !clean(entity.name, 120)) return null;
        if (photoApi()?.isPersonEntity && !photoApi().isPersonEntity(entity, state)) return null;
        const agent = findAgent(entity.name, state);
        const protagonist = Boolean(state?.character && isSameName(entity.name, state.character.name));
        const trust = number(agent?.trust, number(entity?.trust, null));
        const influence = number(agent?.influence, number(entity?.influence, null));
        const relationship = dispositionLabel(agent?.disposition || entity?.relationship || entity?.relation || 'neutrale');
        const publicGoal = clean(agent?.publicGoal || entity?.publicGoal || entity?.goal || entity?.goals, 260);
        const description = clean(entity?.description || entity?.appearance || entity?.historicalRole || entity?.personality, 360);
        return {
            name: clean(entity.name, 120),
            role: roleLabel(entity.role || entity.historicalRole || agent?.role || entity.archetype),
            faction: clean(entity.faction || entity.organization || agent?.subjectName, 140),
            location: clean(entity.location || state?.currentLocation, 140),
            relationship,
            trust,
            influence,
            publicGoal,
            description,
            memories: latestKnownMemories(agent, entity, 3),
            protagonist,
            entity,
            agent
        };
    }

    function staticPortraitUrl(entity, state = getState()) {
        const engine = portraitApi();
        if (!engine || !entity) return '';
        try {
            const portrait = engine.choosePortrait?.(entity, {
                story: state?.currentStory,
                genre: state?.currentStory?.genre,
                setting: state?.currentStory?.setting,
                year: state?.time?.year,
                role: entity.role || entity.historicalRole || entity.archetype,
                gender: entity.gender
            });
            return clean(engine.imageSrc?.(portrait), 500);
        } catch (_error) {
            return '';
        }
    }

    function portraitMarkup(entity, className, state = getState()) {
        const src = staticPortraitUrl(entity, state);
        const name = escapeHtml(entity?.name || 'Personaggio');
        if (src) return `<img class="portrait-image ${className || ''}" src="${escapeHtml(src)}" alt="Ritratto di ${name}" title="Apri scheda di ${name}">`;
        return `<span class="npc-dossier-fallback ${className || ''}" aria-hidden="true">${name.charAt(0).toUpperCase()}</span>`;
    }

    function installStyles(documentRef) {
        if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
        const style = documentRef.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* Le foto devono essere leggibili anche nella chat mobile. */
            body.npc-dossiers-ready .chat-message { align-items: flex-start; gap: 10px; }
            body.npc-dossiers-ready .chat-avatar {
                width: 54px; height: 54px; flex: 0 0 54px; padding: 0; overflow: hidden;
                border-radius: 17px; border: 1px solid rgba(92,60,28,.2); background: rgba(255,255,255,.62);
                box-shadow: 0 5px 14px rgba(48,29,15,.10);
            }
            body.npc-dossiers-ready .chat-avatar img.portrait-image { width: 100% !important; height: 100% !important; border-radius: 16px !important; }
            body.npc-dossiers-ready .chat-candidate-portrait { width: 46px !important; height: 46px !important; border-radius: 14px !important; flex: 0 0 46px; }
            body.npc-dossiers-ready .participant-portrait { width: 28px !important; height: 28px !important; border-radius: 9px !important; vertical-align: middle; }
            body.npc-dossiers-ready .portrait-stack-item { width: 34px !important; height: 34px !important; border-radius: 10px !important; }
            body.npc-dossiers-ready #topbar-protagonist-portrait { width: 42px; height: 42px; }
            body.npc-dossiers-ready #char-portrait {
                width: 154px; height: 154px; margin: 2px auto 8px; overflow: hidden; border-radius: 28px;
                border: 2px solid rgba(139,105,20,.42); box-shadow: 0 12px 28px rgba(47,28,14,.18); font-size: 4em;
            }
            body.npc-dossiers-ready #char-portrait img { width: 100% !important; height: 100% !important; border-radius: 26px !important; }
            body.npc-dossiers-ready img.portrait-image:not(.portrait-choice-image) { cursor: pointer; touch-action: manipulation; }

            /* Agenti del gestionale: foto + identità invece di righe anonime. */
            body.npc-dossiers-ready #management-agents-panel .management-agent-card.npc-dossier-enhanced {
                grid-template-columns: 46px minmax(0,1fr) auto;
                align-items: start; cursor: pointer; touch-action: manipulation;
            }
            #management-agents-panel .npc-agent-card-photo { width: 46px !important; height: 46px !important; border-radius: 14px !important; object-fit: cover; }

            #${MODAL_ID} .npc-dossier-modal { width: min(560px, calc(100vw - 20px)); }
            #${MODAL_ID} .npc-dossier-hero {
                display: grid; grid-template-columns: 112px minmax(0,1fr); gap: 14px; align-items: center;
                margin-bottom: 13px; padding: 13px; border: 1px solid rgba(93,63,29,.16); border-radius: 17px;
                background: linear-gradient(145deg, rgba(255,253,246,.98), rgba(239,222,181,.88));
            }
            #${MODAL_ID} .npc-dossier-photo-wrap {
                width: 112px; height: 112px; overflow: hidden; border-radius: 24px;
                border: 2px solid rgba(139,105,20,.36); background: #302015; box-shadow: 0 10px 24px rgba(47,28,14,.16);
            }
            #${MODAL_ID} .npc-dossier-photo-wrap img { width: 100% !important; height: 100% !important; object-fit: cover !important; border-radius: 22px !important; }
            #${MODAL_ID} .npc-dossier-fallback { width:100%; height:100%; display:grid; place-items:center; color:#fff4cf; font:700 2rem 'Cinzel',serif; }
            #${MODAL_ID} .npc-dossier-name { margin: 0 0 4px; color: #2d1c12; font: 700 1.15rem 'Cinzel',serif; }
            #${MODAL_ID} .npc-dossier-role { color: #765d43; font-size: .88rem; }
            #${MODAL_ID} .npc-dossier-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
            #${MODAL_ID} .npc-dossier-chip { padding:4px 8px; border-radius:999px; background:rgba(255,255,255,.62); border:1px solid rgba(91,62,31,.13); color:#5c472f; font:700 .68rem Arial,sans-serif; }
            #${MODAL_ID} .npc-dossier-stats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-bottom:10px; }
            #${MODAL_ID} .npc-dossier-stat { padding:10px; border-radius:12px; background:rgba(255,255,255,.58); border:1px solid rgba(88,59,27,.12); }
            #${MODAL_ID} .npc-dossier-stat small { display:block; color:#806b54; font:700 .64rem Arial,sans-serif; text-transform:uppercase; letter-spacing:.04em; }
            #${MODAL_ID} .npc-dossier-stat strong { display:block; margin-top:3px; color:#342218; }
            #${MODAL_ID} .npc-dossier-section { margin-top:9px; padding:11px 12px; border-radius:13px; background:rgba(246,236,211,.67); border:1px solid rgba(91,62,31,.11); }
            #${MODAL_ID} .npc-dossier-section h4 { margin:0 0 6px; color:#3a271a; font:700 .8rem 'Cinzel',serif; }
            #${MODAL_ID} .npc-dossier-section p, #${MODAL_ID} .npc-dossier-section li { color:#65513d; font-size:.84rem; line-height:1.4; }
            #${MODAL_ID} .npc-dossier-section ul { margin:0; padding-left:18px; display:grid; gap:5px; }
            #${MODAL_ID} .npc-dossier-actions { display:flex; gap:8px; margin-top:12px; }
            #${MODAL_ID} .npc-dossier-actions button { flex:1; min-height:40px; }
            #${MODAL_ID} .npc-dossier-note { margin-top:9px; color:#806b54; font-size:.72rem; text-align:center; }

            @media (max-width: 620px) {
                body.npc-dossiers-ready .chat-avatar { width: 50px; height: 50px; flex-basis: 50px; border-radius: 15px; }
                body.npc-dossiers-ready #char-portrait { width: 136px; height: 136px; border-radius: 24px; }
                body.npc-dossiers-ready #management-agents-panel .management-agent-card.npc-dossier-enhanced { grid-template-columns: 44px minmax(0,1fr); }
                body.npc-dossiers-ready #management-agents-panel .management-agent-chip { grid-column: 2; }
                #${MODAL_ID} .npc-dossier-hero { grid-template-columns: 92px minmax(0,1fr); gap:11px; padding:10px; }
                #${MODAL_ID} .npc-dossier-photo-wrap { width:92px; height:92px; border-radius:20px; }
            }
        `;
        documentRef.head.appendChild(style);
    }

    function ensureModal(documentRef) {
        let overlay = documentRef.getElementById(MODAL_ID);
        if (overlay) return overlay;
        overlay = documentRef.createElement('div');
        overlay.id = MODAL_ID;
        overlay.className = 'modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Scheda personaggio');
        overlay.innerHTML = `<div class="modal npc-dossier-modal"><div class="modal-header">👤 Personaggio <button class="modal-close" type="button" data-npc-dossier-close>✕</button></div><div class="modal-body" id="${BODY_ID}"></div></div>`;
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest?.('[data-npc-dossier-close]')) closeDossier(documentRef);
        });
        documentRef.body.appendChild(overlay);
        return overlay;
    }

    function dossierMarkup(dossier, state = getState()) {
        const relationship = escapeHtml(dossier.relationship);
        const trust = dossier.trust == null ? '—' : `${Math.round(dossier.trust)}%`;
        const influence = dossier.influence == null ? '—' : `${Math.round(dossier.influence)}%`;
        const chips = [dossier.faction, dossier.location].filter(Boolean).map(value => `<span class="npc-dossier-chip">${escapeHtml(value)}</span>`).join('');
        const memories = dossier.memories.length
            ? `<ul>${dossier.memories.map(memory => `<li>${escapeHtml(memory)}</li>`).join('')}</ul>`
            : '<p>Nessuna interazione importante registrata finora.</p>';
        return `
            <section class="npc-dossier-hero">
                <div class="npc-dossier-photo-wrap">${portraitMarkup(dossier.entity, 'npc-dossier-photo', state)}</div>
                <div>
                    <h3 class="npc-dossier-name">${escapeHtml(dossier.name)}</h3>
                    <div class="npc-dossier-role">${escapeHtml(dossier.role)}</div>
                    <div class="npc-dossier-chips">${chips}</div>
                </div>
            </section>
            <div class="npc-dossier-stats">
                <div class="npc-dossier-stat"><small>Rapporto</small><strong>${relationship}</strong></div>
                <div class="npc-dossier-stat"><small>Fiducia</small><strong>${trust}</strong></div>
                <div class="npc-dossier-stat"><small>Influenza</small><strong>${influence}</strong></div>
                <div class="npc-dossier-stat"><small>Ruolo</small><strong>${escapeHtml(dossier.role)}</strong></div>
            </div>
            ${dossier.description ? `<section class="npc-dossier-section"><h4>Chi è</h4><p>${escapeHtml(dossier.description)}</p></section>` : ''}
            ${dossier.publicGoal ? `<section class="npc-dossier-section"><h4>Obiettivo conosciuto</h4><p>${escapeHtml(dossier.publicGoal)}</p></section>` : ''}
            <section class="npc-dossier-section"><h4>Ricordi del rapporto</h4>${memories}</section>
            <div class="npc-dossier-actions"><button class="btn" type="button" data-npc-dossier-reroll="${escapeHtml(dossier.name)}">↻ Nuovo ritratto</button><button class="btn primary" type="button" data-npc-dossier-close>Chiudi</button></div>
            <div class="npc-dossier-note">La scheda mostra soltanto informazioni note al giocatore: gli obiettivi privati degli NPC restano nascosti.</div>`;
    }

    function refreshRenderedPortraits(name, entry, documentRef) {
        if (!entry?.url) return;
        documentRef.querySelectorAll('img.portrait-image').forEach(img => {
            const label = clean(img.getAttribute('alt'), 160).replace(/^ritratto\s+di\s+/i, '').trim();
            if (!isSameName(label, name)) return;
            img.dataset.portraitPhotoDecorated = '1';
            img.dataset.portraitPhotoLoaded = '1';
            img.dataset.portraitPhotoUrl = entry.url;
            img.dataset.portraitPhotoFallbackApplied = '0';
            img.classList.add('portrait-photo');
            img.src = entry.url;
        });
    }

    function openDossier(entityOrName, documentRef, windowRef) {
        const state = getState();
        const dossier = buildDossier(entityOrName, state);
        if (!dossier || dossier.protagonist) {
            documentRef.getElementById('btn-character')?.click();
            return Boolean(dossier);
        }
        const overlay = ensureModal(documentRef);
        const body = documentRef.getElementById(BODY_ID);
        body.innerHTML = dossierMarkup(dossier, state);
        overlay.classList.add('active');
        overlay.style.display = 'flex';
        const reroll = body.querySelector('[data-npc-dossier-reroll]');
        reroll?.addEventListener('click', () => {
            const api = photoApi();
            const entry = api?.rerollPhoto?.(dossier.entity, state);
            if (!entry) return;
            refreshRenderedPortraits(dossier.name, entry, documentRef);
        });
        windowRef?.setTimeout?.(() => photoApi()?.install?.(documentRef, windowRef), 0);
        return true;
    }

    function closeDossier(documentRef) {
        const overlay = documentRef.getElementById(MODAL_ID);
        if (!overlay) return;
        overlay.classList.remove('active');
        overlay.style.display = '';
    }

    function portraitNameFromTarget(target) {
        const img = target?.closest?.('img.portrait-image');
        if (!img) return '';
        return clean(img.getAttribute('alt'), 180).replace(/^ritratto\s+di\s+/i, '').trim() || clean(img.getAttribute('title'), 120);
    }

    function enhanceAgentCard(card, state = getState()) {
        if (!card || card.dataset.npcDossierEnhanced === '1') return false;
        const strong = card.querySelector('strong');
        const name = clean(strong?.textContent, 120);
        const entity = findEntity(name, state);
        if (!entity || (photoApi()?.isPersonEntity && !photoApi().isPersonEntity(entity, state))) return false;
        card.dataset.npcDossierEnhanced = '1';
        card.dataset.npcDossierName = name;
        card.classList.add('npc-dossier-enhanced');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Apri scheda di ${name}`);
        const holder = document.createElement('span');
        holder.className = 'npc-agent-card-photo-wrap';
        holder.innerHTML = portraitMarkup(entity, 'npc-agent-card-photo', state);
        card.prepend(holder);
        return true;
    }

    function enhance(documentRef, state = getState()) {
        if (!documentRef || !state) return 0;
        let count = 0;
        documentRef.querySelectorAll('#management-agents-panel .management-agent-card').forEach(card => {
            if (enhanceAgentCard(card, state)) count++;
        });
        documentRef.querySelectorAll('img.portrait-image:not(.portrait-choice-image)').forEach(img => {
            const name = portraitNameFromTarget(img);
            if (!name) return;
            img.setAttribute('title', `Apri scheda di ${name}`);
            img.setAttribute('tabindex', '0');
        });
        return count;
    }

    function installInteractions(documentRef, windowRef) {
        if (documentRef.__npcDossierInteractions) return;
        documentRef.__npcDossierInteractions = true;
        documentRef.addEventListener('click', event => {
            const card = event.target?.closest?.('[data-npc-dossier-name]');
            if (card) {
                openDossier(card.dataset.npcDossierName, documentRef, windowRef);
                return;
            }
            const img = event.target?.closest?.('img.portrait-image:not(.portrait-choice-image)');
            if (!img || img.closest('#modal-character')) return;
            const name = portraitNameFromTarget(img);
            if (name) openDossier(name, documentRef, windowRef);
        });
        documentRef.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const card = event.target?.closest?.('[data-npc-dossier-name]');
            if (card) {
                event.preventDefault();
                openDossier(card.dataset.npcDossierName, documentRef, windowRef);
                return;
            }
            const img = event.target?.closest?.('img.portrait-image:not(.portrait-choice-image)');
            if (!img || img.closest('#modal-character')) return;
            const name = portraitNameFromTarget(img);
            if (name) {
                event.preventDefault();
                openDossier(name, documentRef, windowRef);
            }
        });
    }

    function observe(documentRef, windowRef) {
        if (observer || typeof windowRef?.MutationObserver !== 'function' || !documentRef?.body) return;
        observer = new windowRef.MutationObserver(mutations => {
            let shouldEnhance = false;
            mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
                if (node?.nodeType !== 1) return;
                if (node.matches?.('img.portrait-image, .management-agent-card') || node.querySelector?.('img.portrait-image, .management-agent-card')) shouldEnhance = true;
            }));
            if (shouldEnhance) windowRef.setTimeout(() => enhance(documentRef), 0);
        });
        observer.observe(documentRef.body, { childList: true, subtree: true });
    }

    function install(documentRef, windowRef) {
        if (!documentRef || !windowRef) return false;
        installStyles(documentRef);
        ensureModal(documentRef);
        installInteractions(documentRef, windowRef);
        enhance(documentRef);
        observe(documentRef, windowRef);
        documentRef.body?.classList.add('npc-dossiers-ready');
        root.__cronacheNpcDossiersVersion = PATCH_VERSION;
        return true;
    }

    function scheduleInstall() {
        if (typeof document === 'undefined' || typeof window === 'undefined') return;
        const attempt = () => install(document, window);
        [0, 120, 450, 1000, 2200, 4500].forEach(delay => window.setTimeout(attempt, delay));
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attempt, { once: true });
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        clean,
        keyOf,
        isSameName,
        dispositionLabel,
        roleLabel,
        latestKnownMemories,
        findEntity,
        findAgent,
        buildDossier,
        install
    };
});