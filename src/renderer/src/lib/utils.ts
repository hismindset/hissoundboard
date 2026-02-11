import { v4 as uuidv4 } from 'uuid';

/**
 * Smart Import: format a raw filename into a readable display name.
 * - Strip file extension
 * - Replace _, ., - with spaces
 * - Split CamelCase (e.g. "soundEffect" → "sound Effect")
 * - Title Case every word
 *
 * Example: "funny_soundEffect.mp3" → "Funny Sound Effect"
 */
export function formatSoundName(filename: string): string {
    // Strip extension
    let name = filename.replace(/\.[^.]+$/, '');

    // Replace _, ., - with spaces
    name = name.replace(/[_.\-]+/g, ' ');

    // Split CamelCase: insert space before uppercase letters that follow lowercase
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');

    // Title Case
    name = name
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    return name;
}

/** Generate a UUID v4 */
export function generateId(): string {
    return uuidv4();
}
