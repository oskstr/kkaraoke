/**
 * How a karaoke title is chosen from MusicBrainz data.
 *
 * Prefer the linked **work** title when it is the same song as the matched recording.
 * Fall back to the recording title only for mix/soundtrack markers that are not part of
 * the song's name. Do not invent titles by stripping years or concert dates from
 * recording strings — those belong on the recording, and the work (or an override) is
 * the place to get a clean song name.
 */

/** Words that mark a particular master rather than the song's name. */
export const VERSION_MARKER =
    /\b(?:mix|remix|instrumental|acoustic|live|karaoke|backing track|edit|version|reprise|radio|extended|demo|remaster(?:ed)?|re-?recorded|unplugged|dub|a cappella|single|from)\b/i;

/** A language in the bracket is why the venue wrote it — keep `Du hast (English version)`. */
export const LANGUAGE_VERSION =
    /\b(?:english|swedish|finnish|german|spanish|french|italian|norwegian|danish|dutch|portuguese)\b/i;

export function withoutAnnotation(title: string): string {
    return title.replace(/\s*[([][^()[\]]*[\])]\s*$/u, "").trim();
}

export function isMasterAnnotation(inner: string): boolean {
    return VERSION_MARKER.test(inner.trim());
}

/**
 * Pull the show or film out of a `(from "…")` / `(from … soundtrack)` suffix.
 */
export function fromAnnotation(recording: string): string | undefined {
    const bracket = /\s*[([]([^()[\]]*)[)\]]\s*$/.exec(recording);
    if (bracket?.[1] === undefined || !/\bfrom\b/i.test(bracket[1])) {
        return undefined;
    }
    const raw = bracket[1]
        .replace(/^\s*from\s+/i, "")
        .replace(/\s*(?:original\s+)?(?:motion\s+picture\s+)?soundtrack\s*$/i, "")
        .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
        .trim();
    return raw.length > 0 ? raw : undefined;
}

/**
 * MusicBrainz often tacks the second half of a medley on as ` / Excerpt From 'Song'`.
 * That is catalogue noise on the recording, not the karaoke title.
 */
export function stripExcerptFromLabels(title: string): string {
    const cleaned = title
        .replace(/\s*\/\s*Excerpt From\s+['"“”‘’]?[^'"“”‘’/]+['"“”‘’]?/gi, "")
        .replace(/\bExcerpt From\s+['"“”‘’]?[^'"“”‘’/]+['"“”‘’]?/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned.length > 0 ? cleaned : title;
}

/**
 * Recording title cleaned only of master/version markers and excerpt tails — not years or
 * concert places (those need a work title or an override).
 */
export function titleFromRecording(recording: string): { title: string; from?: string } {
    const bracket = /\s*[([]([^()[\]]*)[)\]]\s*$/.exec(recording);
    if (bracket?.[1] === undefined || !isMasterAnnotation(bracket[1])) {
        return { title: stripExcerptFromLabels(recording) };
    }
    if (LANGUAGE_VERSION.test(bracket[1])) {
        const language = LANGUAGE_VERSION.exec(bracket[1])?.[0];
        if (language !== undefined) {
            const capitalized = `${language.charAt(0).toUpperCase()}${language.slice(1).toLowerCase()}`;
            return {
                title: stripExcerptFromLabels(
                    recording.replace(new RegExp(language, "i"), capitalized).replace(/\s+/g, " ").trim(),
                ),
            };
        }
        return { title: stripExcerptFromLabels(recording) };
    }
    const base = withoutAnnotation(recording);
    const title = stripExcerptFromLabels(base.length > 0 ? base : recording);
    const from = fromAnnotation(recording);
    return from === undefined ? { title } : { title, from };
}

/** Fold for comparing song names: letters/digits only, lowercased. */
export function titleKey(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
}

/**
 * Fold common title spelling variants so corroboration can recognise the same song:
 * `How Come U Don't Call Me Anymore` ≈ `How Come You Don't Call Me`.
 */
export function titleKeyLoose(value: string): string {
    return titleKey(value)
        .replace(/you/g, "u")
        .replace(/anymore$/, "");
}

export function editDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const prev = new Array<number>(b.length + 1);
    const cur = new Array<number>(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        cur[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
        }
        for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
    }
    return prev[b.length]!;
}

/**
 * True when the work title names the same song as the recording (punctuation, articles,
 * spelling, or a subtitle expansion) — not a different work wrongly linked as a cover.
 */
export function workTitleCompatible(recordingTitle: string, workTitle: string): boolean {
    if (/\.\.\.$/.test(workTitle.trim()) || /…$/.test(workTitle.trim())) {
        // Truncated work names like `För fet...` are worse than the recording title.
        return false;
    }
    const recording = titleKey(stripExcerptFromLabels(withoutAnnotation(recordingTitle) || recordingTitle));
    const work = titleKey(workTitle);
    if (recording.length === 0 || work.length === 0) return false;
    if (recording === work) return true;

    const shorter = recording.length <= work.length ? recording : work;
    const longer = recording.length <= work.length ? work : recording;
    if (longer.startsWith(shorter) || longer.includes(shorter)) {
        return shorter.length >= Math.min(8, Math.max(4, Math.floor(longer.length * 0.45)));
    }

    const distance = editDistance(recording, work);
    const limit = Math.max(2, Math.floor(Math.min(recording.length, work.length) * 0.25));
    return distance <= limit;
}

/**
 * Whether two titles name the same song for corroboration — looser than publishing rules,
 * so `How Come You Don't Call Me` can confirm `How Come U Don't Call Me Anymore`.
 */
export function titlesCorroborate(a: string, b: string): boolean {
    const exactA = titleKey(a);
    const exactB = titleKey(b);
    if (exactA.length === 0 || exactB.length === 0) return false;
    if (exactA === exactB) return true;
    if (exactA.includes(exactB) || exactB.includes(exactA)) {
        const shorter = exactA.length <= exactB.length ? exactA : exactB;
        return shorter.length >= Math.min(8, Math.max(4, Math.floor(Math.max(exactA.length, exactB.length) * 0.45)));
    }

    const looseA = titleKeyLoose(a);
    const looseB = titleKeyLoose(b);
    if (looseA === looseB) return true;
    if (looseA.includes(looseB) || looseB.includes(looseA)) {
        const shorter = looseA.length <= looseB.length ? looseA : looseB;
        return shorter.length >= 8;
    }
    const distance = editDistance(looseA, looseB);
    const limit = Math.max(2, Math.floor(Math.min(looseA.length, looseB.length) * 0.25));
    return distance <= limit;
}

/**
 * Title to publish: MusicBrainz work title when it is the same song, otherwise the cleaned
 * recording title.
 */
export function publishedTitle(
    recording: string,
    workTitle?: string,
): { title: string; from?: string; source: "work" | "recording" } {
    const fromRecording = titleFromRecording(recording);
    if (workTitle !== undefined && workTitleCompatible(recording, workTitle)) {
        // Same song, different spelling (Prince's `U` / `Anymore` vs Alicia Keys' `You`):
        // keep the matched recording's form — that is what this artist released.
        if (
            titleKey(fromRecording.title) !== titleKey(workTitle) &&
            titlesCorroborate(fromRecording.title, workTitle)
        ) {
            return { ...fromRecording, source: "recording" };
        }
        return fromRecording.from === undefined
            ? { title: workTitle, source: "work" }
            : { title: workTitle, from: fromRecording.from, source: "work" };
    }
    return { ...fromRecording, source: "recording" };
}
