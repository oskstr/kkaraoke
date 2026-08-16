/**
 * Search categories on a song (`categories`) plus umbrellas derived from `from`.
 *
 * `from` and `categories` are independent: a Bond theme has `from: "Goldfinger"` and
 * also belongs to the James Bond category; a Melodifestivalen winner that went to ESC
 * has both contest labels and usually no `from`. Do not treat every Melodifestivalen
 * entry as Eurovision — only songs that actually competed at Eurovision get that label.
 */

/** Films / shows that belong under the Disney category. */
export const DISNEY_FROM = new Set([
    "Aladdin",
    "Beauty and the Beast",
    "Cinderella",
    "Frozen",
    "Frozen II",
    "Hercules",
    "High School Musical",
    "High School Musical 2",
    "Lady and the Tramp",
    "Mary Poppins",
    "Mulan",
    "Peter Pan",
    "Pocahontas",
    "Tarzan",
    "The Jungle Book",
    "The Lion King",
    "The Little Mermaid",
    "Toy Story",
]);

/** James Bond film titles used as `from` on theme songs. */
export const JAMES_BOND_FROM = new Set([
    "A View to a Kill",
    "Die Another Day",
    "For Your Eyes Only",
    "GoldenEye",
    "Goldfinger",
    "Licence to Kill",
    "Octopussy",
    "The Living Daylights",
    "The Spy Who Loved Me",
    "Thunderball",
]);

/**
 * Stage musicals and clear live-action film musicals (Grease, HSM, Mary Poppins, …).
 * Disney animated features with songs stay under Disney only — having musical numbers
 * is not enough to count as a Musical here. Soundtrack cues from non-musical films
 * (Bond, Ghostbusters, LOTR, etc.) stay out entirely.
 */
export const MUSICAL_FROM = new Set([
    "Annie",
    "Annie Get Your Gun",
    "Bye Bye Birdie",
    "Cabaret",
    "Chess",
    "Dreamgirls",
    "Fiddler on the Roof",
    "Funny Girl",
    "Gigi",
    "Grease",
    "Hair",
    "Hamilton",
    "High School Musical",
    "High School Musical 2",
    "Jekyll & Hyde",
    "Jesus Christ Superstar",
    "Joseph",
    "Mary Poppins",
    "Moulin Rouge!",
    "My Fair Lady",
    "Oliver!",
    "Pippin",
    "South Pacific",
    "The Fantasticks",
    "The Music Man",
    "The Phantom of the Opera",
    "The Rocky Horror Picture Show",
    "The Sound of Music",
    "West Side Story",
]);

/**
 * Contest names that were briefly stored as `from` before belonging as categories.
 * Still recognized so leftover data keeps working; new edits should use `categories`.
 */
export const CONTEST_FROM = new Set(["Eurovision", "Melodifestivalen"]);

/** Categories whose membership is derived from `from` (in addition to explicit labels). */
export const FROM_DERIVED_CATEGORIES: Record<string, ReadonlySet<string>> = {
    Disney: DISNEY_FROM,
    "James Bond": JAMES_BOND_FROM,
    Musical: MUSICAL_FROM,
};

export const FROM_DERIVED_CATEGORY_KEYS = Object.keys(FROM_DERIVED_CATEGORIES);

export function categoryFromShow(from: string | undefined): string[] {
    if (!from) return [];
    if (CONTEST_FROM.has(from)) return [from];
    const out: string[] = [];
    for (const [category, shows] of Object.entries(FROM_DERIVED_CATEGORIES)) {
        if (shows.has(from)) out.push(category);
    }
    return out;
}

/** Every browse category a song belongs to (explicit `categories` + derived from `from`). */
export function categoriesForSong(song: { categories?: string[]; from?: string }): string[] {
    const set = new Set<string>();
    for (const cat of song.categories ?? []) set.add(cat);
    for (const cat of categoryFromShow(song.from)) set.add(cat);
    return [...set];
}

/** Display label when there is no performer — joined explicit categories. */
export function categoriesLabel(song: { categories?: string[] }): string {
    return (song.categories ?? []).join(", ");
}

export function songBelongsToCategory(
    song: { categories?: string[]; from?: string },
    key: string,
): boolean {
    return categoriesForSong(song).includes(key);
}
