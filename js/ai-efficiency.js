(function (root) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        module.exports = require('./ai-efficiency-core.js');
        return;
    }
    if (!root || typeof document === 'undefined') return;

    const SCRIPTS = [
        ['js/ai-efficiency-core.js?v=20260818-story-visuals-1', 'data-ai-efficiency-core', '', 'none'],
        ['js/ollama-cloud-catalog-v2.js?v=20260820-ollama-cloud-catalog-3', 'data-ollama-cloud-catalog-v2', 'CronacheOllamaCloudCatalogV2', 'document'],
        ['js/ollama-cloud-power-v3.js?v=20260820-ollama-cloud-power-2', 'data-ollama-cloud-power-v3', 'CronacheOllamaCloudPowerV3', 'document'],
        ['js/ollama-cloud-startup-guard.js?v=20260820-ollama-startup-3', 'data-ollama-cloud-startup-guard', 'CronacheOllamaCloudStartupGuard', 'none'],
        ['js/story-visuals.js?v=20260818-story-visuals-1', 'data-story-visuals', 'CronacheStoryVisuals', 'none'],
        ['js/summary-visuals.js?v=20260819-summary-context-3', 'data-summary-visuals', 'CronacheSummaryVisuals', 'document-window'],
        ['js/timeline-ux.js?v=20260819-timeline-order-1', 'data-timeline-ux', 'CronacheTimelineUX', 'document-window'],
        ['js/timeline-events-safe.js?v=20260819-buttons-fix-1', 'data-timeline-events-safe', 'CronacheTimelineEventsSafe', 'document-window'],
        ['js/strategic-friendly.js?v=20260819-strategic-friendly-1', 'data-strategic-friendly', 'CronacheStrategicFriendly', 'document-window'],
        ['js/ui-consolidation-v9.js?v=20260820-phase9-1', 'data-ui-consolidation-v9', 'CronacheUiConsolidationV9', 'document'],
        ['js/management-director.js?v=20260819-management-director-1', 'data-management-director', 'CronacheManagementDirector', 'none'],
        ['js/management-hub.js?v=20260819-management-first-1', 'data-management-hub', 'CronacheManagementHub', 'document-window'],
        ['js/kingdom-focus-ui.js?v=20260820-kingdom-focus-2', 'data-kingdom-focus-ui', 'CronacheKingdomFocusUI', 'document'],
        ['js/business-specializations.js?v=20260819-sector-specialization-1', 'data-business-specializations', 'CronacheBusinessSpecializations', 'document'],
        ['js/business-sector-effects.js?v=20260819-sector-effects-1', 'data-business-sector-effects', 'CronacheBusinessSectorEffects', 'none'],
        ['js/business-narrative-recovery.js?v=20260820-business-recovery-2', 'data-business-narrative-recovery', 'CronacheBusinessNarrativeRecovery', 'none'],
        ['js/management-agents.js?v=20260819-persistent-agents-1', 'data-management-agents', 'CronacheManagementAgents', 'document-window'],
        ['js/systemic-world.js?v=20260819-systemic-world-1', 'data-systemic-world', 'CronacheSystemicWorld', 'document-window'],
        ['js/management-autonomy-v2.js?v=20260819-management-autonomy-2', 'data-management-autonomy', 'CronacheManagementAutonomy', 'document-window'],
        ['js/management-network.js?v=20260819-agent-network-1', 'data-management-network', 'CronacheManagementNetwork', 'document-window'],
        ['js/player-experience-v6.js?v=20260819-player-experience-1', 'data-player-experience-v6', 'CronachePlayerExperienceV6', 'document-window'],
        ['js/character-lineage.js?v=20260819-character-lineage-2', 'data-character-lineage', 'CronacheCharacterLineage', 'document-window'],
        ['js/portrait-photos.js?v=20260819-contextual-portraits-1', 'data-portrait-photos', 'CronachePortraitPhotos', 'document-window'],
        ['js/npc-identity-coherence.js?v=20260819-npc-identity-1', 'data-npc-identity-coherence', 'CronacheNpcIdentityCoherence', 'document-window'],
        ['js/npc-dossiers.js?v=20260819-npc-dossiers-1', 'data-npc-dossiers', 'CronacheNpcDossiers', 'document-window'],
        ['js/portrait-evolution.js?v=20260819-portrait-evolution-1', 'data-portrait-evolution', 'CronachePortraitEvolution', 'document-window'],
        ['js/chat-experience-v2.js?v=20260819-chat-experience-2', 'data-chat-experience-v2', 'CronacheChatExperienceV2', 'document-window'],
        ['js/chat-compact-ui.js?v=20260820-chat-compact-1', 'data-chat-compact-ui', 'CronacheChatCompactUI', 'document'],
        ['js/chat-inbox-ui.js?v=20260820-chat-inbox-2', 'data-chat-inbox-ui', 'CronacheChatInboxUI', 'document-window'],
        ['js/character-profile-v2.js?v=20260819-character-profile-2', 'data-character-profile-v2', 'CronacheCharacterProfileV2', 'document-window'],
        ['js/quest-manager-v7.js?v=20260820-phase7-1', 'data-quest-manager-v7', 'CronacheQuestManagerV7', 'document-window'],
        ['js/offscreen-world-v7.js?v=20260820-phase7-1', 'data-offscreen-world-v7', 'CronacheOffscreenWorldV7', 'document-window'],
        ['js/turn-resolution-v7.js?v=20260820-phase7-1', 'data-turn-resolution-v7', 'CronacheTurnResolutionV7', 'document-window'],
        ['js/world-travel-v8.js?v=20260820-phase8-1', 'data-world-travel-v8', 'CronacheWorldTravelV8', 'document-window'],
        ['js/world-map-v10.js?v=20260820-world-map-v10-1', 'data-world-map-v10', 'CronacheWorldMapV10', 'document'],
        ['js/world-map-v12-story-svg.js?v=20260820-world-map-story-svg-1', 'data-world-map-v12-story-svg', 'CronacheWorldMapV12StorySvg', 'document'],
        ['js/world-map-v10-mobile-fix.js?v=20260820-world-map-mobile-fix-1', 'data-world-map-v10-mobile-fix', 'CronacheWorldMapV10MobileFix', 'document'],
        ['js/world-map-v10-mobile-layout.js?v=20260820-world-map-mobile-layout-1', 'data-world-map-v10-mobile-layout', 'CronacheWorldMapV10MobileLayout', 'document'],
        ['js/world-map-v10-local-places.js?v=20260820-world-map-local-places-2', 'data-world-map-v10-local-places', 'CronacheWorldMapV10LocalPlaces', 'document'],
        ['js/world-map-v11-levels.js?v=20260820-world-map-levels-2', 'data-world-map-v11-levels', 'CronacheWorldMapV11Levels', 'document'],
        ['js/world-map-v11-gestures-persistent.js?v=20260820-world-map-gestures-persistent-1', 'data-world-map-v11-gestures-persistent', 'CronacheWorldMapV11GesturesPersistent', 'document'],
        ['js/time-montage-v8.js?v=20260820-phase8-1', 'data-time-montage-v8', 'CronacheTimeMontageV8', 'document-window'],
        ['js/scene-continuity-v8.js?v=20260820-phase8-1', 'data-scene-continuity-v8', 'CronacheSceneContinuityV8', 'document-window']
    ].map(([src, marker, globalName, args]) => ({ src, marker, globalName, args }));

    const runtimeState = {
        version: 9,
        startedAt: Date.now(),
        dynamicLoads: [],
        dynamicFailures: []
    };

    function runtimeSnapshot() {
        const modules = SCRIPTS.map(item => {
            const nodes = Array.from(document.querySelectorAll(`script[${item.marker}]`));
            const globalReady = !item.globalName || Boolean(root[item.globalName]);
            return {
                src: item.src,
                marker: item.marker,
                globalName: item.globalName,
                scriptCount: nodes.length,
                globalReady,
                ready: nodes.length === 1 && globalReady
            };
        });
        return {
            version: runtimeState.version,
            expected: modules.length,
            ready: modules.filter(item => item.ready).length,
            failed: modules.filter(item => !item.ready),
            duplicates: modules.filter(item => item.scriptCount > 1),
            dynamicLoads: runtimeState.dynamicLoads.slice(),
            dynamicFailures: runtimeState.dynamicFailures.slice(),
            elapsedMs: Date.now() - runtimeState.startedAt
        };
    }

    root.CronacheRuntimeV9 = {
        version: 9,
        manifest: SCRIPTS.map(item => ({ ...item })),
        snapshot: runtimeSnapshot
    };

    function installFor(item) {
        if (!item.globalName) return;
        const install = root[item.globalName]?.install;
        if (typeof install !== 'function') return;
        try {
            if (item.args === 'document-window') install(document, window);
            else if (item.args === 'document') install(document);
            else install();
        } catch (error) {
            console.error(`[RuntimeLoader] Installazione ${item.globalName} fallita:`, error);
        }
    }

    function appendScript(item, onload) {
        if (document.querySelector(`script[${item.marker}]`)) {
            installFor(item);
            if (onload) onload();
            return;
        }
        const script = document.createElement('script');
        script.src = item.src;
        script.async = false;
        script.setAttribute(item.marker, '1');
        script.onload = () => {
            runtimeState.dynamicLoads.push(item.marker);
            installFor(item);
            if (onload) onload();
        };
        script.onerror = error => {
            runtimeState.dynamicFailures.push(item.marker);
            console.error(`[RuntimeLoader] Impossibile caricare ${item.src}:`, error);
            if (onload) onload();
        };
        document.head.appendChild(script);
    }

    function loadSequentially(index = 0) {
        if (index >= SCRIPTS.length) return;
        appendScript(SCRIPTS[index], () => loadSequentially(index + 1));
    }

    if (document.readyState === 'loading') {
        SCRIPTS.forEach(item => {
            document.write('<script src="' + item.src + '" ' + item.marker + '="1"><\/script>');
        });
    } else {
        loadSequentially();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);