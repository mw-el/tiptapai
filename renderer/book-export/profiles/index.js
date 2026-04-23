/**
 * Profile Registry
 *
 * Central factory for all 5 book profiles.
 * Maps ProfileId → Profile instance.
 */
import { NovelProfile } from './novel.js';
import { TextbookProfile } from './textbook.js';
import { NovellaProfile } from './novella.js';
import { PoetryProfile } from './poetry.js';
import { NewsTwoColProfile } from './news-twocol.js';
// ============ Profile Registry ============
export const PROFILE_CLASSES = {
    'novel': NovelProfile,
    'textbook': TextbookProfile,
    'novella': NovellaProfile,
    'poetry': PoetryProfile,
    'news-twocol': NewsTwoColProfile
};
// Cache for singleton profile instances
const profileCache = new Map();
/**
 * Get a profile instance by ID (singleton)
 *
 * @throws Error if ProfileId is not recognized
 */
export function getProfile(id) {
    if (profileCache.has(id)) {
        return profileCache.get(id);
    }
    const ProfileClass = PROFILE_CLASSES[id];
    if (!ProfileClass) {
        throw new Error(`Unbekanntes Buchprofil: "${id}". ` +
            `Verfügbare Profile: ${Object.keys(PROFILE_CLASSES).join(', ')}`);
    }
    const instance = new ProfileClass();
    profileCache.set(id, instance);
    return instance;
}
/**
 * Get all profile instances
 */
export function getAllProfiles() {
    return Object.keys(PROFILE_CLASSES).map(id => getProfile(id));
}
/**
 * Get display names for dropdown/UI
 */
export function getProfileDisplayNames() {
    const result = {};
    for (const id of Object.keys(PROFILE_CLASSES)) {
        result[id] = getProfile(id).displayName;
    }
    return result;
}
/**
 * Validate that a string is a valid ProfileId
 */
export function isValidProfileId(id) {
    return id in PROFILE_CLASSES;
}
// Re-export individual profile classes
export { NovelProfile } from './novel.js';
export { TextbookProfile } from './textbook.js';
export { NovellaProfile } from './novella.js';
export { PoetryProfile } from './poetry.js';
export { NewsTwoColProfile } from './news-twocol.js';
export { BaseProfile } from './base-profile.js';
//# sourceMappingURL=index.js.map