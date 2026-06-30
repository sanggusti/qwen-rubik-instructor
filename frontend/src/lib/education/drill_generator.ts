// Deterministic drill selection from a static catalog. No randomness so the UI
// and tests behave predictably. "Generator" here means filtered selection by
// category/difficulty, not procedural content generation.

import type { Drill, DrillFilter } from './practice_types';

export function selectDrills(catalog: Drill[], filter: DrillFilter = {}): Drill[] {
    return catalog.filter((drill) => {
        if (filter.category && drill.category !== filter.category) return false;
        if (filter.difficulty && drill.difficulty !== filter.difficulty) return false;
        return true;
    });
}

export function findDrill(catalog: Drill[], id: string): Drill | undefined {
    return catalog.find((drill) => drill.id === id);
}
