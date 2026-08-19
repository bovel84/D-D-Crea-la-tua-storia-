(function (root) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        module.exports = require('./ai-efficiency-core.js');
        return;
    }
    if (!root || typeof document === 'undefined') return;

    const CORE_SRC = 'js/ai-efficiency-core.js?v=20260818-story-visuals-1';
    const VISUAL_SRC = 'js/story-visuals.js?v=20260818-story-visuals-1';
    const SUMMARY_VISUALS_SRC = 'js/summary-visuals.js?v=20260819-summary-context-3';
    const TIMELINE_UX_SRC = 'js/timeline-ux.js?v=20260819-timeline-order-1';
    const TIMELINE_EVENTS_SAFE_SRC = 'js/timeline-events-safe.js?v=20260819-buttons-fix-1';
    const STRATEGIC_FRIENDLY_SRC = 'js/strategic-friendly.js?v=20260819-strategic-friendly-1';
    const INTERFACE_CLEANUP_SRC = 'js/interface-cleanup.js?v=20260819-timeline-clean-2';
    const MANAGEMENT_DIRECTOR_SRC = 'js/management-director.js?v=20260819-management-director-1';
    const MANAGEMENT_HUB_SRC = 'js/management-hub.js?v=20260819-management-first-1';
    const BUSINESS_SPECIALIZATIONS_SRC = 'js/business-specializations.js?v=20260819-sector-specialization-1';
    const BUSINESS_SECTOR_EFFECTS_SRC = 'js/business-sector-effects.js?v=20260819-sector-effects-1';
    const MANAGEMENT_AGENTS_SRC = 'js/management-agents.js?v=20260819-persistent-agents-1';
    const SYSTEMIC_WORLD_SRC = 'js/systemic-world.js?v=20260819-systemic-world-1';
    const MANAGEMENT_AUTONOMY_SRC = 'js/management-autonomy-v2.js?v=20260819-management-autonomy-2';
    const MANAGEMENT_NETWORK_SRC = 'js/management-network.js?v=20260819-agent-network-1';
    const MANAGEMENT_LAYOUT_SRC = 'js/management-layout.js?v=20260819-management-layout-1';

    function appendScript(src, marker, onload) {
        if (document.querySelector(`script[${marker}]`)) {
            if (onload) onload();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.setAttribute(marker, '1');
        if (onload) script.onload = onload;
        script.onerror = error => console.error(`[RuntimeLoader] Impossibile caricare ${src}:`, error);
        document.head.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.write('<script src="' + CORE_SRC + '" data-ai-efficiency-core="1"><\/script>');
        document.write('<script src="' + VISUAL_SRC + '" data-story-visuals="1"><\/script>');
        document.write('<script src="' + SUMMARY_VISUALS_SRC + '" data-summary-visuals="1"><\/script>');
        document.write('<script src="' + TIMELINE_UX_SRC + '" data-timeline-ux="1"><\/script>');
        document.write('<script src="' + TIMELINE_EVENTS_SAFE_SRC + '" data-timeline-events-safe="1"><\/script>');
        document.write('<script src="' + STRATEGIC_FRIENDLY_SRC + '" data-strategic-friendly="1"><\/script>');
        document.write('<script src="' + INTERFACE_CLEANUP_SRC + '" data-interface-cleanup="1"><\/script>');
        document.write('<script src="' + MANAGEMENT_DIRECTOR_SRC + '" data-management-director="1"><\/script>');
        document.write('<script src="' + MANAGEMENT_HUB_SRC + '" data-management-hub="1"><\/script>');
        document.write('<script src="' + BUSINESS_SPECIALIZATIONS_SRC + '" data-business-specializations="1"><\/script>');
        document.write('<script src="' + BUSINESS_SECTOR_EFFECTS_SRC + '" data-business-sector-effects="1"><\/script>');
        document.write('<script src="' + MANAGEMENT_AGENTS_SRC + '" data-management-agents="1"><\/script>');
        document.write('<script src="' + SYSTEMIC_WORLD_SRC + '" data-systemic-world="1"><\/script>');
        document.write('<script src="' + MANAGEMENT_AUTONOMY_SRC + '" data-management-autonomy="1"><\/script>');
        document.write('<script src="' + MANAGEMENT_NETWORK_SRC + '" data-management-network="1"><\/script>');
        document.write('<script src="' + MANAGEMENT_LAYOUT_SRC + '" data-management-layout="1"><\/script>');
    } else {
        appendScript(CORE_SRC, 'data-ai-efficiency-core', () => {
            appendScript(VISUAL_SRC, 'data-story-visuals', () => {
                root.CronacheStoryVisuals?.install?.();
                appendScript(SUMMARY_VISUALS_SRC, 'data-summary-visuals', () => {
                    root.CronacheSummaryVisuals?.install?.(document, window);
                    appendScript(TIMELINE_UX_SRC, 'data-timeline-ux', () => {
                        root.CronacheTimelineUX?.install?.(document, window);
                        appendScript(TIMELINE_EVENTS_SAFE_SRC, 'data-timeline-events-safe', () => {
                            root.CronacheTimelineEventsSafe?.install?.(document, window);
                            appendScript(STRATEGIC_FRIENDLY_SRC, 'data-strategic-friendly', () => {
                                root.CronacheStrategicFriendly?.install?.(document, window);
                                appendScript(INTERFACE_CLEANUP_SRC, 'data-interface-cleanup', () => {
                                    root.CronacheInterfaceCleanup?.install?.(document, window);
                                    appendScript(MANAGEMENT_DIRECTOR_SRC, 'data-management-director', () => {
                                        root.CronacheManagementDirector?.install?.();
                                        appendScript(MANAGEMENT_HUB_SRC, 'data-management-hub', () => {
                                            root.CronacheManagementHub?.install?.(document, window);
                                            appendScript(BUSINESS_SPECIALIZATIONS_SRC, 'data-business-specializations', () => {
                                                root.CronacheBusinessSpecializations?.install?.(document);
                                                appendScript(BUSINESS_SECTOR_EFFECTS_SRC, 'data-business-sector-effects', () => {
                                                    root.CronacheBusinessSectorEffects?.install?.();
                                                    appendScript(MANAGEMENT_AGENTS_SRC, 'data-management-agents', () => {
                                                        root.CronacheManagementAgents?.install?.(document, window);
                                                        appendScript(SYSTEMIC_WORLD_SRC, 'data-systemic-world', () => {
                                                            root.CronacheSystemicWorld?.install?.(document, window);
                                                            appendScript(MANAGEMENT_AUTONOMY_SRC, 'data-management-autonomy', () => {
                                                                root.CronacheManagementAutonomy?.install?.(document, window);
                                                                appendScript(MANAGEMENT_NETWORK_SRC, 'data-management-network', () => {
                                                                    root.CronacheManagementNetwork?.install?.(document, window);
                                                                    appendScript(MANAGEMENT_LAYOUT_SRC, 'data-management-layout', () => {
                                                                        root.CronacheManagementLayout?.install?.(document);
                                                                    });
                                                                });
                                                            });
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
