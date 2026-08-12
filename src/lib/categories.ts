/**
 * Umbrella search categories built from `from` (specific show/film) and/or explicit
 * `category` on a song. Per docs/song-data.md: Disney, Bond themes, musicals, Christmas
 * are browse categories — not fake performers, and not a substitute for `from`.
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
 * Stage musicals and film musicals. Soundtrack cues from non-musical films (Bond,
 * Ghostbusters, LOTR, Eurovision entries, etc.) stay out — those remain under Film only.
 */
export const MUSICAL_FROM = new Set([
    "Aladdin",
    "Annie",
    "Annie Get Your Gun",
    "Beauty and the Beast",
    "Bye Bye Birdie",
    "Cabaret",
    "Chess",
    "Cinderella",
    "Dreamgirls",
    "Fiddler on the Roof",
    "Frozen",
    "Frozen II",
    "Funny Girl",
    "Gigi",
    "Grease",
    "Hair",
    "Hamilton",
    "Hercules",
    "High School Musical",
    "High School Musical 2",
    "Jekyll & Hyde",
    "Jesus Christ Superstar",
    "Joseph",
    "Lady and the Tramp",
    "Mary Poppins",
    "Moulin Rouge!",
    "Mulan",
    "My Fair Lady",
    "Oliver!",
    "Peter Pan",
    "Pippin",
    "Pocahontas",
    "South Pacific",
    "Tarzan",
    "The Fantasticks",
    "The Jungle Book",
    "The Lion King",
    "The Little Mermaid",
    "The Music Man",
    "The Phantom of the Opera",
    "The Rocky Horror Picture Show",
    "The Sound of Music",
    "West Side Story",
]);

/** Categories whose membership is derived from `from` (in addition to explicit `category`). */
export const FROM_DERIVED_CATEGORIES: Record<string, ReadonlySet<string>> = {
    Disney: DISNEY_FROM,
    "James Bond": JAMES_BOND_FROM,
    Musical: MUSICAL_FROM,
};

export const FROM_DERIVED_CATEGORY_KEYS = Object.keys(FROM_DERIVED_CATEGORIES);

export function categoryFromShow(from: string | undefined): string[] {
    if (!from) return [];
    const out: string[] = [];
    for (const [category, shows] of Object.entries(FROM_DERIVED_CATEGORIES)) {
        if (shows.has(from)) out.push(category);
    }
    return out;
}

/** Every browse category a song belongs to (explicit + derived from `from`). */
export function categoriesForSong(song: { category?: string; from?: string }): string[] {
    const set = new Set<string>();
    if (song.category) set.add(song.category);
    for (const cat of categoryFromShow(song.from)) set.add(cat);
    return [...set];
}

export function songBelongsToCategory(
    song: { category?: string; from?: string },
    key: string,
): boolean {
    if (song.category === key) return true;
    const shows = FROM_DERIVED_CATEGORIES[key];
    return shows !== undefined && song.from !== undefined && shows.has(song.from);
}
