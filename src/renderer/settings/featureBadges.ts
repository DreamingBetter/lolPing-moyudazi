export const NEW_FEATURE_SECTION_IDS = ['actions', 'chat', 'room', 'app'] as const;

const NEW_FEATURE_SECTIONS = new Set<string>(NEW_FEATURE_SECTION_IDS);

export function sectionHasNewFeature(id: string): boolean {
  return NEW_FEATURE_SECTIONS.has(id);
}
