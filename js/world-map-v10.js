(function (root, factory) {
    const api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.CronacheWorldMapV10 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const PATCH_VERSION = 1;
    const GEOGRAPHY_SCHEMA_VERSION = 1;
    const STYLE_ID = 'cronache-world-map-v10-style';
    const MAP_SOURCE_WIDTH = 1000;
    const MAP_SOURCE_HEIGHT = 650;
    const FALLBACK_ZONE_COLORS = ['#9f2530', '#60338f', '#1d6379', '#8a5b15', '#315c39', '#7e3d67', '#4b4f69', '#8b3c22'];
    const runtime = {
        installed: false,
        lastModel: null,
        lastContext: null,
        selectedLocationId: '',
        observer: null
    };

    const asArray = value => Array.isArray(value) ? value : [];
    const clean = (value, max = 500) => String(value == null ? '' : value)
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const keyOf = value => clean(value, 700).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function hashText(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getGameState() {
        try { if (typeof G !== 'undefined') return G; } catch (_error) { }
        return root.G || null;
    }

    function hierarchyLocationMap(hierarchy) {
        const map = new Map();
        asArray(hierarchy?.continents).forEach(continent => {
            const continentName = clean(continent?.name, 120);
            asArray(continent?.nations).forEach(nation => {
                const nationName = clean(nation?.name, 120);
                const controllingFaction = clean(nation?.controllingFaction, 120);
                asArray(nation?.regions).forEach(region => {
                    const regionName = clean(region?.name, 120);
                    const terrain = clean(region?.terrain, 60);
                    asArray(region?.locationNames).forEach(name => {
                        const locationName = clean(name, 120);
                        if (!locationName) return;
                        map.set(keyOf(locationName), {
                            continent: continentName,
                            nation: nationName,
                            region: regionName,
                            terrain,
                            controllingFaction
                        });
                    });
                });
            });
        });
        return map;
    }

    function mergeLocationMeta(base, next) {
        const merged = { ...base };
        ['id', 'name', 'continent', 'nation', 'region', 'terrain', 'type', 'controller', 'source'].forEach(field => {
            if (clean(next?.[field], 300)) merged[field] = next[field];
        });
        ['x', 'y', 'lat', 'long', 'lng', 'latitude', 'longitude'].forEach(field => {
            if (Number.isFinite(Number(next?.[field]))) merged[field] = Number(next[field]);
        });
        if (Array.isArray(next?.connections) && next.connections.length) merged.connections = next.connections.slice();
        return merged;
    }

    function snapshotGeography(worldValue) {
        const world = worldValue && typeof worldValue === 'object' ? worldValue : {};
        const existing = world.geography && typeof world.geography === 'object' ? world.geography : {};
        const hierarchy = world.hierarchy || existing.hierarchy || null;
        const hierarchyMap = hierarchyLocationMap(hierarchy);
        const byName = new Map();

        asArray(existing.locations).forEach(item => {
            const name = clean(item?.name, 120);
            if (!name) return;
            byName.set(keyOf(name), mergeLocationMeta({}, item));
        });
        asArray(world.locations).forEach(item => {
            const name = clean(item?.name, 120);
            if (!name) return;
            const key = keyOf(name);
            const inferred = hierarchyMap.get(key) || {};
            byName.set(key, mergeLocationMeta(mergeLocationMeta(byName.get(key) || {}, inferred), item));
        });

        const locations = [...byName.values()].filter(item => clean(item.name, 120));
        if (!hierarchy && !locations.some(item => item.nation || item.continent || Number.isFinite(item.x) || Number.isFinite(item.y))) {
            return existing && Object.keys(existing).length ? existing : null;
        }
        return {
            schemaVersion: GEOGRAPHY_SCHEMA_VERSION,
            sourceWidth: Number(existing.sourceWidth) || MAP_SOURCE_WIDTH,
            sourceHeight: Number(existing.sourceHeight) || MAP_SOURCE_HEIGHT,
            hierarchy,
            locations,
            updatedAtTurn: Math.max(0, Number(world.updatedAtTurn ?? existing.updatedAtTurn) || 0)
        };
    }

    function hydrateWorldLocations(worldValue, geographyValue) {
        const world = worldValue && typeof worldValue === 'object' ? worldValue : null;
        if (!world) return world;
        const geography = geographyValue || snapshotGeography(world);
        if (!geography) return world;
        const byName = new Map(asArray(geography.locations).map(item => [keyOf(item.name), item]));
        world.geography = geography;
        if (!world.hierarchy && geography.hierarchy) world.hierarchy = geography.hierarchy;
        world.locations = asArray(world.locations).map(location => {
            const meta = byName.get(keyOf(location?.name));
            if (!meta) return location;
            const next = { ...location };
            ['continent', 'nation', 'region', 'terrain'].forEach(field => {
                if (!clean(next[field], 120) && clean(meta[field], 120)) next[field] = meta[field];
            });
            ['x', 'y', 'lat', 'long', 'lng', 'latitude', 'longitude'].forEach(field => {
                if (!Number.isFinite(Number(next[field])) && Number.isFinite(Number(meta[field]))) next[field] = Number(meta[field]);
            });
            if ((!Array.isArray(next.connections) || !next.connections.length) && Array.isArray(meta.connections)) {
                next.connections = meta.connections.slice();
            }
            return next;
        });
        return world;
    }

    function wrapGenerator() {
        const generator = root.CronacheWorldGenerator;
        if (!generator || typeof generator.normalizeGeneratedWorld !== 'function') return false;
        const original = generator.normalizeGeneratedWorld;
        if (original.__worldMapV10Wrapped) return true;
        const wrapped = function normalizeGeneratedWorldWithGeography(generated, context) {
            const world = original.call(this, generated, context);
            world.geography = snapshotGeography(world);
            return hydrateWorldLocations(world, world.geography);
        };
        wrapped.__worldMapV10Wrapped = true;
        wrapped.__worldMapV10Original = original;
        generator.normalizeGeneratedWorld = wrapped;
        return true;
    }

    function preserveWorldResult(original, self, args) {
        const source = args[0] && typeof args[0] === 'object' ? args[0] : null;
        const geography = source ? snapshotGeography(source) : null;
        if (source && geography) hydrateWorldLocations(source, geography);
        const result = original.apply(self, args);
        if (result && typeof result === 'object' && Array.isArray(result.locations)) {
            const merged = snapshotGeography({ ...result, geography: result.geography || geography });
            if (merged) hydrateWorldLocations(result, merged);
        }
        return result;
    }

    function wrapBootstrap() {
        const bootstrap = root.CronacheWorldBootstrap;
        if (!bootstrap) return false;
        const worldReturning = [
            'migrateWorld', 'ensureMinimumWorld', 'ingestResponse', 'syncFromMemory',
            'applyWorldMoves', 'applyTimelineEvents', 'markInteraction', 'applyConversationOutcomes'
        ];
        worldReturning.forEach(name => {
            const original = bootstrap[name];
            if (typeof original !== 'function' || original.__worldMapV10Wrapped) return;
            const wrapped = function worldMapV10BootstrapWrapper(...args) {
                return preserveWorldResult(original, this, args);
            };
            wrapped.__worldMapV10Wrapped = true;
            wrapped.__worldMapV10Original = original;
            bootstrap[name] = wrapped;
        });
        const project = bootstrap.projectToMemory;
        if (typeof project === 'function' && !project.__worldMapV10Wrapped) {
            const wrappedProject = function projectToMemoryWithGeography(world, memory, context) {
                const geography = snapshotGeography(world);
                if (geography) hydrateWorldLocations(world, geography);
                const result = project.call(this, world, memory, context);
                if (result && result.world && geography) hydrateWorldLocations(result.world, geography);
                return result;
            };
            wrappedProject.__worldMapV10Wrapped = true;
            wrappedProject.__worldMapV10Original = project;
            bootstrap.projectToMemory = wrappedProject;
        }
        return true;
    }

    function hydrateTravelState(state = getGameState()) {
        const world = state?.worldMemory?.world;
        if (!world) return state;
        const geography = snapshotGeography(world);
        if (geography) hydrateWorldLocations(world, geography);
        return state;
    }

    function wrapTravel() {
        const travel = root.CronacheWorldTravelV8;
        if (!travel) return false;
        ['collectLocations', 'findLocation', 'inferDestination', 'isTravelAction', 'planTravel'].forEach(name => {
            const original = travel[name];
            if (typeof original !== 'function' || original.__worldMapV10Wrapped) return;
            const wrapped = function worldMapV10TravelWrapper(...args) {
                const explicitState = args.find(value => value && typeof value === 'object' && value.worldMemory);
                hydrateTravelState(explicitState || getGameState());
                return original.apply(this, args);
            };
            wrapped.__worldMapV10Wrapped = true;
            wrapped.__worldMapV10Original = original;
            travel[name] = wrapped;
        });
        return true;
    }

    function metadataForLocation(world, geography, locationName) {
        const wanted = keyOf(locationName);
        const hierarchy = hierarchyLocationMap(geography?.hierarchy || world?.hierarchy);
        const geo = asArray(geography?.locations).find(item => keyOf(item?.name) === wanted);
        const raw = asArray(world?.locations).find(item => keyOf(item?.name) === wanted);
        return mergeLocationMeta(mergeLocationMeta(hierarchy.get(wanted) || {}, geo || {}), raw || {});
    }

    function assignHierarchyLayout(model) {
        const locs = asArray(model?.locations);
        const hierarchical = locs.filter(location => clean(location.nation || location.region, 120));
        if (hierarchical.length < 2) return;
        const nations = [...new Set(hierarchical.map(location => clean(location.nation, 120) || clean(location.continent, 120) || 'Territorio'))];
        const width = Number(model.width) || 960;
        const height = Number(model.height) || 620;
        const marginX = 88;
        const marginY = 84;
        const usableW = Math.max(300, width - marginX * 2);
        const usableH = Math.max(220, height - marginY * 2);
        const columns = Math.max(1, Math.ceil(Math.sqrt(nations.length * (usableW / usableH))));
        const rows = Math.max(1, Math.ceil(nations.length / columns));
        const cellW = usableW / columns;
        const cellH = usableH / rows;

        nations.forEach((nationName, nationIndex) => {
            const column = nationIndex % columns;
            const row = Math.floor(nationIndex / columns);
            const nationCenter = {
                x: marginX + cellW * (column + 0.5),
                y: marginY + cellH * (row + 0.5)
            };
            const nationLocations = hierarchical.filter(location => (clean(location.nation, 120) || clean(location.continent, 120) || 'Territorio') === nationName);
            const regions = [...new Set(nationLocations.map(location => clean(location.region, 120) || nationName))];
            const regionRadius = Math.min(cellW, cellH) * 0.24;
            regions.forEach((regionName, regionIndex) => {
                const angle = regions.length === 1 ? -Math.PI / 2 : (Math.PI * 2 * regionIndex / regions.length) - Math.PI / 2;
                const center = regions.length === 1 ? nationCenter : {
                    x: nationCenter.x + Math.cos(angle) * regionRadius,
                    y: nationCenter.y + Math.sin(angle) * regionRadius
                };
                const regionLocations = nationLocations.filter(location => (clean(location.region, 120) || nationName) === regionName);
                regionLocations.forEach((location, locationIndex) => {
                    if (location._geoExplicit) return;
                    const localAngle = regionLocations.length === 1 ? 0 : (Math.PI * 2 * locationIndex / regionLocations.length) + (hashText(location.name) % 40) / 100;
                    const radius = regionLocations.length === 1 ? 0 : Math.min(58, 26 + regionLocations.length * 5);
                    location.x = Math.round(clamp(center.x + Math.cos(localAngle) * radius, 45, width - 45));
                    location.y = Math.round(clamp(center.y + Math.sin(localAngle) * radius, 45, height - 55));
                });
            });
        });
    }

    function reconcileSites(model) {
        const locs = asArray(model?.locations);
        locs.filter(location => /property|business|resource/.test(clean(location.kind, 40))).forEach(location => {
            if (location._geoExplicit) return;
            const regionKey = keyOf(location.region);
            if (!regionKey) return;
            const parent = locs.find(candidate => candidate.id !== location.id && !/property|business|resource/.test(clean(candidate.kind, 40)) &&
                [candidate.name, candidate.region, candidate.nation].some(value => keyOf(value) === regionKey));
            if (!parent) return;
            const angle = (hashText(location.name) % 360) * Math.PI / 180;
            const radius = 52 + (hashText(`${location.name}|site`) % 28);
            location.x = Math.round(clamp(parent.x + Math.cos(angle) * radius, 40, (Number(model.width) || 960) - 40));
            location.y = Math.round(clamp(parent.y + Math.sin(angle) * radius, 40, (Number(model.height) || 620) - 45));
        });
    }

    function factionTerritorySource(world, modelFaction) {
        const faction = asArray(world?.factions).find(item => keyOf(item?.name) === keyOf(modelFaction?.name));
        return clean(faction?.territory || faction?.region || faction?.nation, 120);
    }

    function convexHull(points) {
        const unique = [...new Map(points.map(point => [`${Math.round(point.x)}:${Math.round(point.y)}`, point])).values()];
        if (unique.length <= 2) return unique;
        const sorted = unique.slice().sort((a, b) => a.x - b.x || a.y - b.y);
        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const lower = [];
        sorted.forEach(point => {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
            lower.push(point);
        });
        const upper = [];
        sorted.slice().reverse().forEach(point => {
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
            upper.push(point);
        });
        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    function paddedPolygon(points, padding, width, height) {
        if (!points.length) return [];
        if (points.length === 1) {
            const p = points[0];
            return Array.from({ length: 8 }, (_, index) => {
                const angle = Math.PI * 2 * index / 8;
                return {
                    x: clamp(p.x + Math.cos(angle) * padding, 24, width - 24),
                    y: clamp(p.y + Math.sin(angle) * padding, 24, height - 24)
                };
            });
        }
        if (points.length === 2) {
            const [a, b] = points;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const length = Math.max(1, Math.hypot(dx, dy));
            const px = -dy / length * padding;
            const py = dx / length * padding;
            const ux = dx / length * padding * 0.55;
            const uy = dy / length * padding * 0.55;
            return [
                { x: a.x - ux + px, y: a.y - uy + py },
                { x: b.x + ux + px, y: b.y + uy + py },
                { x: b.x + ux - px, y: b.y + uy - py },
                { x: a.x - ux - px, y: a.y - uy - py }
            ].map(point => ({ x: clamp(point.x, 24, width - 24), y: clamp(point.y, 24, height - 24) }));
        }
        const hull = convexHull(points);
        const center = hull.reduce((sum, point) => ({ x: sum.x + point.x / hull.length, y: sum.y + point.y / hull.length }), { x: 0, y: 0 });
        return hull.map(point => {
            const dx = point.x - center.x;
            const dy = point.y - center.y;
            const length = Math.max(1, Math.hypot(dx, dy));
            return {
                x: clamp(point.x + dx / length * padding, 24, width - 24),
                y: clamp(point.y + dy / length * padding, 24, height - 24)
            };
        });
    }

    function buildPoliticalZones(model, world) {
        const width = Number(model.width) || 960;
        const height = Number(model.height) || 620;
        const hierarchy = model.hierarchy || world?.hierarchy || world?.geography?.hierarchy;
        const nationsFromHierarchy = [];
        asArray(hierarchy?.continents).forEach(continent => asArray(continent?.nations).forEach(nation => {
            nationsFromHierarchy.push({
                continent: clean(continent.name, 120),
                name: clean(nation.name, 120),
                controller: clean(nation.controllingFaction, 120),
                regions: asArray(nation.regions).map(region => clean(region.name, 120)).filter(Boolean)
            });
        }));
        const nationNames = [...new Set([
            ...nationsFromHierarchy.map(item => item.name),
            ...asArray(model.locations).map(location => clean(location.nation, 120)).filter(Boolean)
        ])];
        return nationNames.map((nationName, index) => {
            const locations = asArray(model.locations).filter(location => keyOf(location.nation) === keyOf(nationName) && !/property|business|resource/.test(clean(location.kind, 40)));
            if (!locations.length) return null;
            const hierarchyNation = nationsFromHierarchy.find(item => keyOf(item.name) === keyOf(nationName));
            let faction = asArray(model.factions).find(item => keyOf(item.name) === keyOf(hierarchyNation?.controller));
            if (!faction) faction = asArray(model.factions).find(item => keyOf(factionTerritorySource(world, item)) === keyOf(nationName));
            if (!faction && hierarchyNation?.regions?.length) {
                faction = asArray(model.factions).find(item => hierarchyNation.regions.some(region => keyOf(factionTerritorySource(world, item)) === keyOf(region)));
            }
            const points = paddedPolygon(locations.map(location => ({ x: location.x, y: location.y })), 54, width, height);
            const center = locations.reduce((sum, location) => ({ x: sum.x + location.x / locations.length, y: sum.y + location.y / locations.length }), { x: 0, y: 0 });
            return {
                id: `political-zone-${hashText(nationName).toString(36)}`,
                name: nationName,
                continent: hierarchyNation?.continent || clean(locations[0]?.continent, 120),
                controller: faction?.name || hierarchyNation?.controller || '',
                factionId: faction?.id || '',
                color: faction?.color || FALLBACK_ZONE_COLORS[hashText(nationName) % FALLBACK_ZONE_COLORS.length],
                stance: faction?.stance || 'uncertain',
                points,
                labelX: Math.round(center.x),
                labelY: Math.round(center.y - 58)
            };
        }).filter(Boolean);
    }

    function buildRegionLabels(model) {
        const groups = new Map();
        asArray(model.locations).forEach(location => {
            const region = clean(location.region, 120);
            if (!region || /property|business|resource/.test(clean(location.kind, 40))) return;
            const key = `${keyOf(location.nation)}|${keyOf(region)}`;
            if (!groups.has(key)) groups.set(key, { name: region, nation: clean(location.nation, 120), terrain: clean(location.terrain, 60), locations: [] });
            groups.get(key).locations.push(location);
        });
        return [...groups.values()].map(group => {
            const center = group.locations.reduce((sum, location) => ({ x: sum.x + location.x / group.locations.length, y: sum.y + location.y / group.locations.length }), { x: 0, y: 0 });
            return { ...group, x: Math.round(center.x), y: Math.round(center.y + 60) };
        });
    }

    function signalIcon(event) {
        const text = keyOf(`${event?.title || ''} ${event?.summary || ''} ${event?.type || ''}`);
        if (/guerra|battagl|assed|attacc|militar|invas/.test(text)) return '⚔';
        if (/rivolt|incend|sommoss|protest|ribell/.test(text)) return '🔥';
        if (/mercat|commerc|prezz|carest|crisi-econom|finanz|denaro/.test(text)) return '¤';
        if (/diplom|ambasci|accord|trattat|negozi/.test(text)) return '⚜';
        if (/morte|omicid|assassin|crimine/.test(text)) return '☠';
        return '!';
    }

    function findSignalLocation(event, locations) {
        const direct = clean(event?.location || event?.locationName || event?.place || event?.region, 140);
        if (direct) {
            const directKey = keyOf(direct);
            const found = locations.find(location => keyOf(location.name) === directKey)
                || locations.find(location => keyOf(location.name).includes(directKey) || directKey.includes(keyOf(location.name)));
            if (found) return found;
        }
        const corpus = keyOf(`${event?.title || ''} ${event?.summary || ''} ${event?.description || ''}`);
        return locations.slice().sort((a, b) => keyOf(b.name).length - keyOf(a.name).length)
            .find(location => keyOf(location.name) && corpus.includes(keyOf(location.name))) || null;
    }

    function buildLiveSignals(model, memory, context) {
        const turn = Math.max(0, Number(context?.turn ?? memory?.turnCount) || 0);
        const signals = [];
        asArray(memory?.events).slice(-24).forEach((event, index) => {
            const status = keyOf(event?.status);
            const eventTurn = Math.max(0, Number(event?.turn ?? event?.createdAtTurn) || 0);
            if (/resolved|closed|completed|archived|risolt|chius|complet/.test(status) && eventTurn && turn - eventTurn > 2) return;
            if (eventTurn && turn - eventTurn > 5) return;
            const location = findSignalLocation(event, asArray(model.locations));
            if (!location || location.fogState === 'hidden') return;
            signals.push({
                id: clean(event?.id, 160) || `map-signal-${hashText(`${event?.title}|${eventTurn}|${index}`).toString(36)}`,
                locationId: location.id,
                title: clean(event?.title || event?.summary || 'Evento', 120),
                summary: clean(event?.summary || event?.description, 260),
                icon: signalIcon(event),
                x: location.x + 24 + (signals.filter(item => item.locationId === location.id).length * 18),
                y: location.y - 34,
                turn: eventTurn,
                importance: clean(event?.importance || event?.severity, 40)
            });
        });
        return signals.slice(-12);
    }

    function enrichMapModel(model, world, memory, context, geography) {
        if (!model || !Array.isArray(model.locations)) return model;
        const geo = geography || snapshotGeography(world) || {};
        const sourceW = Number(geo.sourceWidth) || MAP_SOURCE_WIDTH;
        const sourceH = Number(geo.sourceHeight) || MAP_SOURCE_HEIGHT;
        model.locations.forEach(location => {
            const meta = metadataForLocation(world, geo, location.name);
            ['continent', 'nation', 'region', 'terrain'].forEach(field => {
                if (clean(meta[field], 120)) location[field] = meta[field];
            });
            if (Number.isFinite(Number(meta.x)) && Number.isFinite(Number(meta.y))) {
                location.x = Math.round(clamp(Number(meta.x) * model.width / sourceW, 40, model.width - 40));
                location.y = Math.round(clamp(Number(meta.y) * model.height / sourceH, 40, model.height - 45));
                location._geoExplicit = true;
            } else {
                location._geoExplicit = false;
            }
        });
        assignHierarchyLayout(model);
        reconcileSites(model);
        model.factions = asArray(model.factions).map(faction => ({
            ...faction,
            territory: factionTerritorySource(world, faction)
        }));
        model.politicalZones = buildPoliticalZones(model, world);
        model.regionLabels = buildRegionLabels(model);
        model.liveSignals = buildLiveSignals(model, memory, context);
        model.geographyVersion = GEOGRAPHY_SCHEMA_VERSION;
        return model;
    }

    function territoryMarkup(model) {
        const zones = asArray(model?.politicalZones).map(zone => {
            const points = asArray(zone.points).map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join(' ');
            if (!points) return '';
            const label = zone.controller ? `${zone.name} · ${zone.controller}` : zone.name;
            return `<g class="world-map-political-zone ${escapeHtml(zone.stance || 'uncertain')}" style="--map-zone-color:${escapeHtml(zone.color)}"><polygon points="${points}"/><text x="${zone.labelX}" y="${zone.labelY}" text-anchor="middle">${escapeHtml(label)}</text></g>`;
        }).join('');
        const regions = asArray(model?.regionLabels).map(region =>
            `<text class="world-map-region-label terrain-${escapeHtml(keyOf(region.terrain || 'plain'))}" x="${region.x}" y="${region.y}" text-anchor="middle">${escapeHtml(region.name)}${region.terrain ? ` · ${escapeHtml(region.terrain)}` : ''}</text>`
        ).join('');
        return `<g class="world-map-territories">${zones}</g><g class="world-map-region-labels">${regions}</g>`;
    }

    function signalsMarkup(model) {
        return `<g class="world-map-live-signals">${asArray(model?.liveSignals).map(signal =>
            `<g class="world-map-live-signal" transform="translate(${Math.round(signal.x)} ${Math.round(signal.y)})"><circle r="13"/><text text-anchor="middle" dominant-baseline="central">${escapeHtml(signal.icon)}</text><title>${escapeHtml(signal.title)}${signal.summary ? ` — ${escapeHtml(signal.summary)}` : ''}</title></g>`
        ).join('')}</g>`;
    }

    function wrapMap() {
        const map = root.CronacheWorldMap;
        if (!map || typeof map.buildMapModel !== 'function' || typeof map.svgMarkup !== 'function') return false;
        if (!map.buildMapModel.__worldMapV10Wrapped) {
            const originalBuild = map.buildMapModel;
            const wrappedBuild = function buildMapModelV10(input = {}, context = {}) {
                const world = input?.world || input || {};
                const memory = input?.memory || {};
                const geography = snapshotGeography(world);
                if (geography) hydrateWorldLocations(world, geography);
                const model = originalBuild.call(this, input, context);
                runtime.lastContext = { world, memory, context };
                runtime.lastModel = enrichMapModel(model, world, memory, context, geography);
                return runtime.lastModel;
            };
            wrappedBuild.__worldMapV10Wrapped = true;
            wrappedBuild.__worldMapV10Original = originalBuild;
            map.buildMapModel = wrappedBuild;
        }
        if (!map.svgMarkup.__worldMapV10Wrapped) {
            const originalSvg = map.svgMarkup;
            const wrappedSvg = function svgMarkupV10(model) {
                let svg = originalSvg.call(this, model);
                if (!svg || !model) return svg;
                const territories = territoryMarkup(model);
                const signals = signalsMarkup(model);
                svg = svg.replace('<g class="world-map-routes">', `${territories}<g class="world-map-routes">`);
                svg = svg.replace('<g class="world-map-compass"', `${signals}<g class="world-map-compass"`);
                return svg;
            };
            wrappedSvg.__worldMapV10Wrapped = true;
            wrappedSvg.__worldMapV10Original = originalSvg;
            map.svgMarkup = wrappedSvg;
        }
        return true;
    }

    function cssText() {
        return `
.world-map-status{flex-wrap:wrap}
.world-map-v10-layerbar{display:flex;align-items:center;gap:6px;flex:1 0 100%;min-width:0;overflow-x:auto;scrollbar-width:none;padding-top:5px;border-top:1px solid rgba(105,69,24,.14)}
.world-map-v10-layerbar::-webkit-scrollbar{display:none}
.world-map-v10-breadcrumb{min-width:max-content;margin-right:auto;color:#5c4129;font:700 .66rem 'Cinzel',serif;white-space:nowrap}
.world-map-v10-layer,.world-map-v10-reset{flex:0 0 auto;min-height:31px;padding:5px 9px;border:1px solid rgba(105,69,24,.3);border-radius:999px;background:rgba(255,250,230,.76);color:#4b321f;font:700 .62rem 'Cinzel',serif;cursor:pointer}
.world-map-v10-layer[aria-pressed='true']{color:#fff8da;background:#6f2d35;border-color:#6f2d35}
.world-map-political-zone{pointer-events:none;color:var(--map-zone-color)}
.world-map-political-zone polygon{fill:color-mix(in srgb,var(--map-zone-color) 14%,transparent);stroke:var(--map-zone-color);stroke-width:3;stroke-dasharray:10 7;opacity:.86}
.world-map-political-zone.hostile polygon{fill:color-mix(in srgb,var(--map-zone-color) 20%,transparent);stroke-width:5}
.world-map-political-zone text{fill:var(--map-zone-color);paint-order:stroke;stroke:rgba(244,228,178,.9);stroke-width:5px;font:700 13px 'Cinzel',serif;letter-spacing:.02em}
.world-map-region-label{fill:#5b452f;opacity:.72;paint-order:stroke;stroke:rgba(244,228,178,.86);stroke-width:4px;font:italic 700 11px Georgia,serif;pointer-events:none}
.world-map-live-signals{pointer-events:none}
.world-map-live-signal circle{fill:#a3242c;stroke:#ffe28a;stroke-width:3;filter:url(#map-shadow)}
.world-map-live-signal text{fill:#fff8dc;font:700 13px Georgia,serif}
.map-v10-hide-politics .world-map-territories,.map-v10-hide-politics .world-map-region-labels{display:none}
.map-v10-hide-events .world-map-live-signals{display:none}
.map-v10-hide-routes .world-map-routes{display:none}
.world-map-node.map-v10-outscope{opacity:.08!important;pointer-events:none!important}
.world-map-v10-context{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:10px 0}
.world-map-v10-context>div{padding:7px 8px;border-radius:9px;background:rgba(255,255,255,.48);font-size:.7rem;min-width:0}
.world-map-v10-context b{display:block;color:#3c291d;font:700 .58rem 'Cinzel',serif;text-transform:uppercase}
.world-map-v10-context span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6a5138}
.world-map-v10-present{margin:8px 0;padding:8px 9px;border-left:3px solid #8b6914;border-radius:8px;background:rgba(255,255,255,.4);color:#5d4938;font-size:.72rem}
.world-map-v10-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.world-map-v10-action{flex:1 1 115px;min-height:39px;padding:7px 9px;border:1px solid rgba(105,69,24,.32);border-radius:10px;background:linear-gradient(180deg,#fff9e9,#ddc88f);color:#412d1d;font:700 .68rem 'Cinzel',serif;cursor:pointer}
.world-map-v10-action.primary{color:#fff8dc;border-color:#7b2329;background:linear-gradient(180deg,#a73138,#71191f)}
.world-map-v10-sheet-handle{display:none}
@media(max-width:760px){
  .world-map-body{position:relative;height:calc(100dvh - 70px);grid-template-areas:'status' 'intel' 'tools' 'map';grid-template-rows:auto auto auto minmax(0,1fr);overflow:hidden!important}
  .world-map-viewport{height:auto!important;min-height:0!important}
  .world-map-side{position:fixed;z-index:900;left:8px;right:8px;bottom:8px;max-height:min(56dvh,520px)!important;padding:0 9px 12px;overflow-y:auto!important;border:1px solid rgba(94,57,22,.3);border-radius:20px 20px 14px 14px;background:rgba(239,226,183,.98);box-shadow:0 -14px 40px rgba(33,20,12,.38);transform:translateY(calc(100% - 58px));transition:transform .24s ease}
  .world-map-side.map-v10-sheet-open{transform:translateY(0)}
  .world-map-v10-sheet-handle{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:center;min-height:42px;margin:0 -9px 8px;background:rgba(239,226,183,.98);border-radius:20px 20px 0 0;cursor:pointer}
  .world-map-v10-sheet-handle::before{content:'';width:48px;height:5px;border-radius:999px;background:rgba(70,44,25,.35)}
  .world-map-factions{margin-bottom:8px}
}
@media(max-width:430px){
  .world-map-intel{display:none!important}
  .world-map-body{grid-template-areas:'status' 'tools' 'map';grid-template-rows:auto auto minmax(0,1fr)}
  .world-map-v10-context{grid-template-columns:1fr 1fr}
  .world-map-v10-layerbar{padding-bottom:1px}
}`;
    }

    function ensureStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = cssText();
        (doc.head || doc.documentElement).appendChild(style);
    }

    function ensureLayerBar(doc) {
        const status = doc?.querySelector('#modal-world-map .world-map-status');
        if (!status || status.querySelector('.world-map-v10-layerbar')) return;
        const bar = doc.createElement('div');
        bar.className = 'world-map-v10-layerbar';
        bar.innerHTML = '<span class="world-map-v10-breadcrumb">Mondo</span>' +
            '<button type="button" class="world-map-v10-reset">⌂ Tutto</button>' +
            '<button type="button" class="world-map-v10-layer" data-v10-layer="politics" aria-pressed="true">◫ Politica</button>' +
            '<button type="button" class="world-map-v10-layer" data-v10-layer="events" aria-pressed="true">⚡ Eventi</button>' +
            '<button type="button" class="world-map-v10-layer" data-v10-layer="routes" aria-pressed="true">— Percorsi</button>';
        status.appendChild(bar);
    }

    function ensureSheetHandle(doc) {
        const side = doc?.querySelector('#modal-world-map .world-map-side');
        if (!side || side.querySelector('.world-map-v10-sheet-handle')) return;
        const handle = doc.createElement('button');
        handle.type = 'button';
        handle.className = 'world-map-v10-sheet-handle';
        handle.setAttribute('aria-label', 'Apri o chiudi dettagli luogo');
        side.prepend(handle);
        handle.addEventListener('click', () => side.classList.toggle('map-v10-sheet-open'));
    }

    function locationByIdOrName(id, name) {
        const model = runtime.lastModel;
        if (!model) return null;
        return asArray(model.locations).find(location => id && location.id === id)
            || asArray(model.locations).find(location => keyOf(location.name) === keyOf(name))
            || null;
    }

    function actorsAtLocation(location) {
        const state = getGameState();
        const world = state?.worldMemory?.world || runtime.lastContext?.world || {};
        return asArray(world.actors).filter(actor => keyOf(actor?.location) === keyOf(location?.name)).slice(0, 5);
    }

    function setBreadcrumb(doc, location, scopeLabel) {
        const crumb = doc?.querySelector('.world-map-v10-breadcrumb');
        if (!crumb) return;
        if (scopeLabel) {
            crumb.textContent = scopeLabel;
            return;
        }
        const parts = ['Mondo', location?.continent, location?.nation, location?.region, location?.name].map(value => clean(value, 80)).filter(Boolean);
        crumb.textContent = [...new Set(parts)].join(' › ');
    }

    function clearScope(doc) {
        doc?.querySelectorAll('#modal-world-map .world-map-node.map-v10-outscope').forEach(node => node.classList.remove('map-v10-outscope'));
        setBreadcrumb(doc, null, 'Mondo');
    }

    function applyScope(doc, location, level) {
        if (!doc || !location) return;
        const value = clean(location[level], 120);
        if (!value) return;
        const wanted = keyOf(value);
        const matches = asArray(runtime.lastModel?.locations).filter(item => keyOf(item[level]) === wanted);
        const ids = new Set(matches.map(item => item.id));
        doc.querySelectorAll('#modal-world-map .world-map-node').forEach(node => {
            node.classList.toggle('map-v10-outscope', !ids.has(node.dataset.mapLocationId));
        });
        const label = level === 'nation'
            ? `Mondo › ${clean(location.continent, 80) || 'Continente'} › ${value}`
            : `Mondo › ${clean(location.nation, 80) || 'Nazione'} › ${value}`;
        setBreadcrumb(doc, location, label);
        const viewport = doc.getElementById('world-map-viewport');
        if (viewport && matches.length) {
            const centerX = matches.reduce((sum, item) => sum + item.x, 0) / matches.length;
            const centerY = matches.reduce((sum, item) => sum + item.y, 0) / matches.length;
            const svg = doc.querySelector('#world-map-canvas .world-map-svg');
            const scale = svg ? svg.getBoundingClientRect().width / (runtime.lastModel.width || 960) : 1;
            viewport.scrollTo({
                left: Math.max(0, centerX * scale - viewport.clientWidth / 2),
                top: Math.max(0, centerY * scale - viewport.clientHeight / 2),
                behavior: 'smooth'
            });
        }
    }

    function dispatchTravel(doc, location) {
        if (!doc || !location || location.current) return;
        const input = doc.getElementById('action-input');
        const send = doc.getElementById('btn-send');
        if (!input || !send) return;
        input.value = `Vado a ${location.name}`;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const close = doc.querySelector('#modal-world-map .modal-close,[data-close="modal-world-map"]');
        if (close) close.click();
        setTimeout(() => send.click(), 40);
    }

    function decorateDetail(doc, location) {
        const detail = doc?.getElementById('world-map-detail');
        if (!detail || !location) return;
        if (detail.dataset.mapV10Location === location.id && detail.querySelector('.world-map-v10-actions')) return;
        detail.dataset.mapV10Location = location.id;
        detail.querySelectorAll('.world-map-v10-context,.world-map-v10-present,.world-map-v10-actions').forEach(node => node.remove());
        const context = doc.createElement('div');
        context.className = 'world-map-v10-context';
        const fields = [
            ['Nazione', location.nation], ['Regione', location.region],
            ['Terreno', location.terrain], ['Controllo', location.controller || 'non definito']
        ].filter(([, value]) => clean(value, 120));
        context.innerHTML = fields.map(([label, value]) => `<div><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`).join('');
        if (fields.length) detail.appendChild(context);

        const actors = actorsAtLocation(location);
        const signals = asArray(runtime.lastModel?.liveSignals).filter(signal => signal.locationId === location.id);
        if (actors.length || signals.length) {
            const present = doc.createElement('div');
            present.className = 'world-map-v10-present';
            const actorText = actors.length ? `Presenti: ${actors.map(actor => clean(actor.name, 80)).join(', ')}` : '';
            const signalText = signals.length ? `Eventi: ${signals.map(signal => `${signal.icon} ${signal.title}`).join(' · ')}` : '';
            present.textContent = [actorText, signalText].filter(Boolean).join(' · ');
            detail.appendChild(present);
        }

        const actions = doc.createElement('div');
        actions.className = 'world-map-v10-actions';
        if (location.nation) actions.insertAdjacentHTML('beforeend', '<button type="button" class="world-map-v10-action" data-v10-scope="nation">▣ Vedi nazione</button>');
        if (location.region) actions.insertAdjacentHTML('beforeend', '<button type="button" class="world-map-v10-action" data-v10-scope="region">⌘ Vedi regione</button>');
        if (!location.current) actions.insertAdjacentHTML('beforeend', '<button type="button" class="world-map-v10-action primary" data-v10-travel="1">🧭 Viaggia qui</button>');
        if (actions.children.length) detail.appendChild(actions);
        actions.querySelectorAll('[data-v10-scope]').forEach(button => button.addEventListener('click', () => applyScope(doc, location, button.dataset.v10Scope)));
        actions.querySelector('[data-v10-travel]')?.addEventListener('click', () => dispatchTravel(doc, location));
        setBreadcrumb(doc, location);
    }

    function decorateCurrentDetail(doc) {
        const detail = doc?.getElementById('world-map-detail');
        if (!detail || !runtime.lastModel) return;
        const title = clean(detail.querySelector('h3')?.textContent, 120);
        const location = locationByIdOrName(runtime.selectedLocationId, title)
            || asArray(runtime.lastModel.locations).find(item => item.current)
            || runtime.lastModel.locations[0];
        if (location) decorateDetail(doc, location);
    }

    function toggleLayer(doc, button) {
        const modal = doc?.getElementById('modal-world-map');
        if (!modal || !button) return;
        const layer = button.dataset.v10Layer;
        const pressed = button.getAttribute('aria-pressed') !== 'false';
        const next = !pressed;
        button.setAttribute('aria-pressed', String(next));
        const className = layer === 'politics' ? 'map-v10-hide-politics' : layer === 'events' ? 'map-v10-hide-events' : 'map-v10-hide-routes';
        modal.classList.toggle(className, !next);
    }

    function bindDom(doc) {
        if (!doc || doc.documentElement?.dataset.worldMapV10Bound === '1') return;
        if (doc.documentElement) doc.documentElement.dataset.worldMapV10Bound = '1';
        doc.addEventListener('click', event => {
            const layerButton = event.target.closest?.('.world-map-v10-layer');
            if (layerButton) {
                toggleLayer(doc, layerButton);
                return;
            }
            if (event.target.closest?.('.world-map-v10-reset')) {
                clearScope(doc);
                return;
            }
            const node = event.target.closest?.('#modal-world-map .world-map-node');
            if (node) {
                runtime.selectedLocationId = node.dataset.mapLocationId || '';
                const location = locationByIdOrName(runtime.selectedLocationId, '');
                const side = doc.querySelector('#modal-world-map .world-map-side');
                if (side && root.matchMedia?.('(max-width: 760px)').matches) side.classList.add('map-v10-sheet-open');
                setTimeout(() => decorateDetail(doc, location), 0);
            }
        }, true);
    }

    function observeDom(doc) {
        if (!doc || runtime.observer || typeof MutationObserver === 'undefined') return;
        runtime.observer = new MutationObserver(() => {
            ensureLayerBar(doc);
            ensureSheetHandle(doc);
            if (doc.getElementById('modal-world-map')?.classList.contains('active')) decorateCurrentDetail(doc);
        });
        runtime.observer.observe(doc.documentElement || doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    function install(doc = typeof document !== 'undefined' ? document : null) {
        const patched = [wrapGenerator(), wrapBootstrap(), wrapTravel(), wrapMap()].some(Boolean);
        if (doc) {
            ensureStyles(doc);
            ensureLayerBar(doc);
            ensureSheetHandle(doc);
            bindDom(doc);
            observeDom(doc);
        }
        runtime.installed = runtime.installed || patched;
        root.__cronacheWorldMapV10Version = PATCH_VERSION;
        return patched;
    }

    function scheduleInstall() {
        if (typeof root.setTimeout !== 'function') return;
        [0, 80, 250, 700, 1500, 3000].forEach(delay => root.setTimeout(() => install(), delay));
    }

    if (typeof document !== 'undefined') scheduleInstall();

    return {
        PATCH_VERSION,
        GEOGRAPHY_SCHEMA_VERSION,
        snapshotGeography,
        hydrateWorldLocations,
        hierarchyLocationMap,
        assignHierarchyLayout,
        convexHull,
        paddedPolygon,
        buildPoliticalZones,
        buildRegionLabels,
        buildLiveSignals,
        enrichMapModel,
        territoryMarkup,
        signalsMarkup,
        cssText,
        install,
        runtime
    };
});
