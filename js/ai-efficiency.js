(function (root) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        module.exports = require('./ai-efficiency-core.js');
        return;
    }
    if (!root || typeof document === 'undefined') return;

    const SCRIPTS = [
        ['js/ai-efficiency-core.js?v=20260818-story-visuals-1', 'data-ai-efficiency-core', '', 'none'],
        ['js/story-visuals.js?v=20260818-story-visuals-1', 'data-story-visuals', 'CronacheStoryVisuals', 'none'],
        ['js/summary-visuals.js?v=20260819-summary-context-3', 'data-summary-visuals', 'CronacheSummaryVisuals', 'document-window'],
        ['js/timeline-ux.js?v=20260819-timeline-order-1', 'data-timeline-ux', 'CronacheTimelineUX', 'document-window'],
        ['js/timeline-events-safe.js?v=20260819-buttons-fix-1', 'data-timeline-events-safe', 'CronacheTimelineEventsSafe', 'document-window'],
        ['js/strategic-friendly.js?v=20260819-strategic-friendly-1', 'data-strategic-friendly', 'CronacheStrategicFriendly', 'document-window'],
        ['js/interface-cleanup.js?v=20260819-timeline-clean-2', 'data-interface-cleanup', 'CronacheInterfaceCleanup', 'document-window'],
        ['js/management-director.js?v=20260819-management-director-1', 'data-management-director', 'CronacheManagementDirector', 'none'],
        ['js/management-hub.js?v=20260819-management-first-1', 'data-management-hub', 'CronacheManagementHub', 'document-window'],
        ['js/business-specializations.js?v=20260819-sector-specialization-1', 'data-business-specializations', 'CronacheBusinessSpecializations', 'document'],
        ['js/business-sector-effects.js?v=20260819-sector-effects-1', 'data-business-sector-effects', 'CronacheBusinessSectorEffects', 'none'],
        ['js/management-agents.js?v=20260819-persistent-agents-1', 'data-management-agents', 'CronacheManagementAgents', 'document-window'],
        ['js/systemic-world.js?v=20260819-systemic-world-1', 'data-systemic-world', 'CronacheSystemicWorld', 'document-window'],
        ['js/management-autonomy-v2.js?v=20260819-management-autonomy-2', 'data-management-autonomy', 'CronacheManagementAutonomy', 'document-window'],
        ['js/management-network.js?v=20260819-agent-network-1', 'data-management-network', 'CronacheManagementNetwork', 'document-window'],
        ['js/management-layout.js?v=20260819-management-layout-1', 'data-management-layout', 'CronacheManagementLayout', 'document'],
        ['js/player-experience-v6.js?v=20260819-player-experience-1', 'data-player-experience-v6', 'CronachePlayerExperienceV6', 'document-window'],
        ['js/character-lineage.js?v=20260819-character-lineage-2', 'data-character-lineage', 'CronacheCharacterLineage', 'document-window'],
        ['js/portrait-photos.js?v=20260819-contextual-portraits-1', 'data-portrait-photos', 'CronachePortraitPhotos', 'document-window'],
        ['js/npc-identity-coherence.js?v=20260819-npc-identity-1', 'data-npc-identity-coherence', 'CronacheNpcIdentityCoherence', 'document-window'],
        ['js/npc-dossiers.js?v=20260819-npc-dossiers-1', 'data-npc-dossiers', 'CronacheNpcDossiers', 'document-window'],
        ['js/portrait-evolution.js?v=20260819-portrait-evolution-1', 'data-portrait-evolution', 'CronachePortraitEvolution', 'document-window'],
        ['js/portrait-size-tuning.js?v=20260819-protagonist-size-2', 'data-portrait-size-tuning', 'CronachePortraitSizeTuning', 'document'],
        ['js/chat-experience-v2.js?v=20260819-chat-experience-2', 'data-chat-experience-v2', 'CronacheChatExperienceV2', 'document-window'],
        ['js/character-profile-v2.js?v=20260819-character-profile-2', 'data-character-profile-v2', 'CronacheCharacterProfileV2', 'document-window'],
        ['js/quest-manager-v7.js?v=20260820-phase7-1', 'data-quest-manager-v7', 'CronacheQuestManagerV7', 'document-window'],
        ['js/offscreen-world-v7.js?v=20260820-phase7-1', 'data-offscreen-world-v7', 'CronacheOffscreenWorldV7', 'document-window'],
        ['js/turn-resolution-v7.js?v=20260820-phase7-1', 'data-turn-resolution-v7', 'CronacheTurnResolutionV7', 'document-window']
    ].map(([src, marker, globalName, args]) => ({ src, marker, globalName, args }));

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
            installFor(item);
            if (onload) onload();
        };
        script.onerror = error => {
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
