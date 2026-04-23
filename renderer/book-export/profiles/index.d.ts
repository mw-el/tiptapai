/**
 * Profile Registry
 *
 * Central factory for all 5 book profiles.
 * Maps ProfileId → Profile instance.
 */
import type { Profile, ProfileId } from '../types.js';
export declare const PROFILE_CLASSES: Record<ProfileId, new () => Profile>;
/**
 * Get a profile instance by ID (singleton)
 *
 * @throws Error if ProfileId is not recognized
 */
export declare function getProfile(id: ProfileId): Profile;
/**
 * Get all profile instances
 */
export declare function getAllProfiles(): Profile[];
/**
 * Get display names for dropdown/UI
 */
export declare function getProfileDisplayNames(): Record<ProfileId, string>;
/**
 * Validate that a string is a valid ProfileId
 */
export declare function isValidProfileId(id: string): id is ProfileId;
export { NovelProfile } from './novel.js';
export { TextbookProfile } from './textbook.js';
export { NovellaProfile } from './novella.js';
export { PoetryProfile } from './poetry.js';
export { NewsTwoColProfile } from './news-twocol.js';
export { BaseProfile } from './base-profile.js';
