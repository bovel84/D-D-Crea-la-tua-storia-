(function (root) {
    'use strict';

    if (typeof module === 'object' && module.exports) {
        module.exports = require('./ai-efficiency-core.js');
        return;
    }
    if (!root || typeof document === 'undefined') return;

    const CORE_SRC = 'js/ai-efficiency-core.js?v=20260818-story-visuals-1';
    const VISUAL_SRC = 'js/story-visuals.js?v=20260818-story-visuals-1';
    const TIMELINE_UX_SRC = 'js/timeline-ux.js?v=20260819-timeline-order-1';
    const TIMELINE_EVENTS_ONLY_SRC = 'js/timeline-events-only.js?v=20260819-events-only-1';

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
        document.write('<script src="' + TIMELINE_UX_SRC + '" data-timeline-ux="1"><\/script>');
        document.write('<script src="' + TIMELINE_EVENTS_ONLY_SRC + '" data-timeline-events-only="1"><\/script>');
    } else {
        appendScript(CORE_SRC, 'data-ai-efficiency-core', () => {
            appendScript(VISUAL_SRC, 'data-story-visuals', () => {
                root.CronacheStoryVisuals?.install?.();
                appendScript(TIMELINE_UX_SRC, 'data-timeline-ux', () => {
                    root.CronacheTimelineUX?.install?.(document, window);
                    appendScript(TIMELINE_EVENTS_ONLY_SRC, 'data-timeline-events-only', () => {
                        root.CronacheTimelineEventsOnly?.install?.(document, window);
                    });
                });
            });
        });
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
