/**
 * In-memory bookmarked / saved requirements store indexed by userId -> Map<requirementId, savedAtIso>.
 * Mirrors push-notification.service.ts and requirement-alerts.service.ts so bookmarks persist
 * across requests in both PostgreSQL and resilient mock-db runtime modes.
 */
const userSavedRequirementsMap = new Map<string, Map<string, string>>();

export function saveRequirementForUser(
  userId: string,
  requirementId: string
): { saved: true; savedAt: string } {
  let savedMap = userSavedRequirementsMap.get(userId);
  if (!savedMap) {
    savedMap = new Map<string, string>();
    userSavedRequirementsMap.set(userId, savedMap);
  }
  const existing = savedMap.get(requirementId);
  const savedAt = existing ?? new Date().toISOString();
  savedMap.set(requirementId, savedAt);
  return { saved: true, savedAt };
}

export function unsaveRequirementForUser(
  userId: string,
  requirementId: string
): boolean {
  const savedMap = userSavedRequirementsMap.get(userId);
  if (!savedMap) return false;
  const removed = savedMap.delete(requirementId);
  if (savedMap.size === 0) {
    userSavedRequirementsMap.delete(userId);
  }
  return removed;
}

export function isRequirementSavedByUser(
  userId: string,
  requirementId: string
): boolean {
  return userSavedRequirementsMap.get(userId)?.has(requirementId) ?? false;
}

export function getSavedRequirementEntriesForUser(
  userId: string
): Array<{ requirementId: string; savedAt: string }> {
  const savedMap = userSavedRequirementsMap.get(userId);
  if (!savedMap) return [];
  return Array.from(savedMap.entries())
    .map(([requirementId, savedAt]) => ({ requirementId, savedAt }))
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}
