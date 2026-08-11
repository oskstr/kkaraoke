# Correcting and enriching the song data

The scrape in `data/songs.json` is the venue's data verbatim: a punch-in number, an artist string and a title
string. This describes how we turn that into something worth browsing — canonical artists, real titles, years,
languages — without ever inventing a fact.

Nothing here is built yet. This is the design, with the parts that were tested against the live MusicBrainz API
marked as such, so that the guesses are told apart from the findings.

## The rule everything else follows

**A field is either traceable to a lookup, or it is empty.** Every value we add carries the entity id it came
from and the query that found it. When a lookup comes back empty or ambiguous, the answer is to record that and
move on, never to fill the gap from memory. An agent doing this work is valuable because it can search, read the
candidates and judge them — not because it knows about music.

The corollary is that "no artist found" is a legitimate, final answer for some songs, and the pipeline has to be
able to say so.

## Three layers, and who is allowed to write to them

| File                  | Written by              | Contents                                                          |
| :-------------------- | :---------------------- | :---------------------------------------------------------------- |
| `data/songs.json`     | `pnpm fetch:songs` only | The scrape. Never hand-edited.                                    |
| `data/resolved.json`  | the resolver only       | Lookup results and provenance. Fully regenerable; safe to delete. |
| `data/overrides.json` | humans only             | Review decisions and hand corrections. No script ever writes it.  |

The site composes the three, with overrides winning. Keeping the machine-written and human-written files apart is
the whole point: a re-scrape or a re-run must never be able to destroy a review decision. Raw API responses are
cached outside the repository, so a re-run costs nothing and does not show up in diffs.

Songs are keyed by `postId`, the venue's WordPress id, because their punch-in `id` is the more likely of the two
to be reassigned.

**`id` is never corrected.** It is the number you type into the machine, so changing it is the one edit that can
break the site's actual purpose.

## Resolving artists first

2080 artist strings against 5915 songs, and the artist work is where the visible value is — artist pages, the
case variants, the collaboration splitting. Doing it first also makes the song pass tractable, because a song
lookup scoped to a known artist is a far narrower question than a title search against the whole database.

For prioritisation: 1278 artists have exactly one song, so **802 artists cover 4637 songs (78% of the
catalogue)**. The long tail is 22% of the songs at the highest cost per item and the worst source coverage, and
is the natural place to let flags accumulate rather than grind.

### Search on aliases, not on the name field

_Tested._ A name-restricted search misses artists the venue names by an alias, and the failure is silent because
something else scores 100:

```
artist:"Hall & Oates"   ->  100  HmfO: A Hall and Oates Tribute
                            89  Mind Over Matter: A Tribute to Hall and Oates
```

The real duo is `Daryl Hall & John Oates` and did not appear at all. Both an unfielded query and
`alias:"Hall & Oates"` return it at 100, with the tribute band demoted to 83. So: **query unfielded, and treat a
score of 100 as "worth checking", never as "correct".**

### Corroborate a candidate with the titles we already have

_Tested, and this is the load-bearing trick._ We know which songs the venue files under each artist, so we can
ask whether a candidate actually recorded them, scoped by the candidate's id:

```
recording:"<our title>" AND arid:<candidate mbid>
```

Three of our `Hall & Oates` titles, against the two candidates:

```
Daryl Hall & John Oates          Maneater -> 100   Rich girl -> 100   You make my dreams -> 100
HmfO: A Hall and Oates Tribute   Maneater -> miss  Rich girl -> miss  You make my dreams -> miss
```

Two or three sampled titles are enough to separate the real entity from a lexically similar one. It also returns
the canonical title casing (`Rich girl` becomes `Rich Girl`), so the same request that confirms the artist starts
fixing the titles.

Do not try to corroborate by browsing a candidate's recordings instead. _Tested:_ ABBA has far more than a page
of them, and an arbitrary 100 matched only 3 of our 32 ABBA titles, which looks like a mismatch and is not one.

### Splitting collaborations is a lookup, not a rule

379 artist strings contain a separator, and the syntax carries no information about how many artists there are:

- `Peter, Björn & John` is one group (_tested:_ resolves to `Peter Bjorn and John` at 100), as are
  `Peter, Paul & Mary` and `Emerson, Lake & Palmer`
- `Christina Aguilera, Lil Kim, Mya & Pink` is four artists, in the same shape
- 39 of the 269 strings containing `&` either follow the `X & The Ys` pattern or are known single acts —
  `Hall & Oates`, `Simon & Garfunkel`, `Adam & The Ants`, `KC & The Sunshine Band` — and that count comes from
  probing patterns we already knew, so the real figure is higher
- `Lilly Wood & The Prick And Robin Schulz` is a band whose name contains `&`, collaborating via `And`
- the five slash cases are not collaborations at all: `Björn Skifs/Blue Swede`, `Jimmy Somerville/Bronski Beat`,
  `Travis/Fran Healey` and `Rosie/Originals` each pair a band with its own frontman, and `Ac/Dc` is just
  miscased

So the order is: resolve the **whole string** first, and only if that fails try splitting — then resolve every
part, and fail the whole thing if any part does not resolve. Never split first.

## What we extract

Grouped by how well it can actually be grounded, which is not the same as how much we want it.

**Reliable.** Canonical artist name and MBID. Canonical title. First release year. Language. Aliases and
translated titles, which are what let someone find `Stilla natt` by typing "Silent Night". Composer, from the
work, which doubles as the signal for traditional material. Whether the credit is a collaboration, and of how
many credited artists.

**Two years, deliberately.** The release year of the earliest release by the credited artist, and separately the
work's first publication year. They diverge wildly for standards and traditional songs, and picking one would
mean arguing about it later.

**Match works, not recordings.** A karaoke catalogue is full of covers, and there are thousands of karaoke
recordings that would pollute recording-level matching. Works also carry the composer and the translations.
_Tested:_ `Stilla natt` resolves to a work at 100 with type `Song`.

**Sparse, take what's there.** Genre. MusicBrainz genres are user tags, so they are thin and inconsistent at
recording level and better at artist level. Take them per artist, allow a per-song override, and accept blanks
across the long tail. Genre is the field where the temptation to guess is strongest and must be resisted hardest.

**Not groundable, do not promise it.** Duet. _Tested and it failed:_ recording-level vocal-role relations came
back empty for the duets we tried, so there is no credit data to read. Worse, a title-only recording search
picks arbitrary recordings — searching `Wake Me Up` returned a J-pop group rather than Avicii, and
`Endless Love` returned a compilation track credited to Kenny Rogers.

Two credited artists also does not mean a duet: 25 of our multi-artist strings are a producer or DJ plus a
vocalist, where only one person sings — `Avicii Ft. Robbie Williams`, `Calvin Harris Feat. Ellie Goulding`,
`David Guetta & Akon`, `Kygo ft. Selena Gomez`. Meanwhile `Lionel Richie & Diana Ross – Endless love` and
`Paul McCartney & Stevie Wonder – Ebony and ivory` are real duets in the same shape.

So the pipeline records the collaboration structure, which it can prove, and duet stays a human-curated flag on
a small high-value set. Cover art is out of scope.

## Flagging: the resolver reports on itself

Rather than detecting problems afterwards with heuristics, each record carries the resolver's own account of how
the lookup went:

- `resolved` — one candidate, corroborated
- `ambiguous` — several plausible candidates, all of them recorded, with the reason it could not choose
- `unmatched` — nothing credible found
- `not-applicable` — no performer exists to find, e.g. a traditional work or a medley

Only `ambiguous` and `unmatched` need human eyes, and the queue is ordered by blast radius: a placeholder
covering 39 songs before an obscure single. Because the agent's confidence is itself a claim, a sample of
`resolved` records should be spot-checked so we know whether that confidence is worth anything.

## Songs with no real artist

30 artist values covering **124 songs**, in three kinds that need different handling.

**Finnish (39, filed under `Finsk musik`).** Real songs by real artists, filed under a language label rather than
a performer. Title-only lookup is ambiguous across the dump (`Myrskyn jälkeen` hits several artists at score 100),
so the resolution path is a proposal that names the karaoke-standard performer and keeps the language bucket in
`from` (same pattern as `Italian`) — e.g. Kari Tapio for `Myrskyn jälkeen`, Juice Leskinen Slam for
`Viidestoista yö`. The common fact across the group is language, not a shared artist; until a dedicated language
field exists, `from: "Finsk musik"` preserves what people search for.

**Christmas (19, filed under `Julsång`).** Mostly traditional or 19th-century works — `Stilla natt`,
`Sankta Lucia`, `Bjällerklang`, `Gläns över sjö och strand`. Where a single karaoke performer is clear, propose
that artist and keep the Christmas category in `from` (`Julsång`). Most of these have no canonical performer —
`O helga natt` has a composer but not one singer — so inventing one would be worse than leaving the category
alone. `Jul medley` is not a single work at all.

**Films and musicals (28 values, 66 songs).** `Disney` (13 songs), `Chicago` (5), `Sound of Music` (4),
`High school musical` (4), `Grease` (3), `Frozen II` (3), `Moulin Rouge` (3), plus `Blues Brothers`,
`Jesus Christ Superstar`, `Hamilton`, `West Side Story` and `Lady & The Tramp`. `Chicago` is genuinely
ambiguous, since the band and the musical both exist and only the song titles can separate them. There is also
annotation leakage to strip: `Enya (fellowship Of The Ring Soundtrack)`, `Irish traditional song`.

These mostly do have a findable performer — the actor or artist who recorded the version — but which performer
depends on which production, so they need the same candidate-and-review treatment as the Finnish songs rather
than being treated as artist-less.

## Known scope of the corrections

| Problem                                        | Scope                                                           |
| :--------------------------------------------- | :-------------------------------------------------------------- |
| Titles sentence-cased by the venue             | 4109 of 4869 multi-word titles (84%)                            |
| Artist strings encoding more than one artist   | 379                                                             |
| Dropped leading "The"                          | 25+ confirmed (`Beatles`, `Kinks`, `Police`, `Clash`, `Eagles`) |
| Sentence-cased acronyms                        | `Abba`, `Kiss`, `Rem`, `Ac/Dc`, `Inxs`                          |
| Case-only duplicate artists                    | 18 clusters, 36 strings                                         |
| Same song listed twice under different numbers | 34 pairs, e.g. `Coldplay – In my place` as 119 and 4477         |
| Songs with no real artist                      | 124, across 30 artist values                                    |

The title casing is not a scattering of typos but a transformation applied to the whole catalogue, which is why
titles are a 5900-lookup job and not a cleanup pass.

The 34 duplicate pairs need a product decision rather than a lookup: either show one row carrying both numbers,
or keep both rows, since either number works at the machine. **Deferred to the UI rework**, where we can see how
each option actually reads on the page.

## Matching offline, which changes the plan

Everything above assumes the web service is the only way in. It is not, and the alternative is better enough to
restructure around.

MusicBrainz publishes a [canonical metadata dump](https://musicbrainz.org/doc/Canonical_MusicBrainz_data) built for
exactly our problem: turning an (artist string, title string) pair into MBIDs. Its `combined_lookup` column is the
artist and recording names concatenated with punctuation and whitespace removed and diacritics folded to ASCII, so
the venue's own deviations stop mattering. CC0, 2.3 GB compressed, refreshed twice a month, no API key.

`pnpm match:canonical` streams it once. **5220 of 5915 songs matched in 45 seconds with no requests at all**, each
carrying artist MBIDs, a recording MBID and the canonical title. For comparison, the same work through the web
service is hours of crawling and would still have missed several of these:

- `Lou Bega` + `Mambo No5` matches `Mambo No. 5` exactly, because the key ignores the punctuation the venue dropped
- `Loa Falkman` + `Symfoni` reaches `Symfonin` by prefix
- the casing problem solves itself: `Losing my religion` comes back `Losing My Religion`, `Back in the USSR` comes
  back `Back in the U.S.S.R.`, apostrophes and dashes included. That was supposed to be a 5900-lookup song pass.

Two rewrites of the venue's strings earn their keep, and each match records which one found it:

| Rewrite                        |  Recovers | Why                                                                                                                                        |
| :----------------------------- | --------: | :----------------------------------------------------------------------------------------------------------------------------------------- |
| prepend the article            | 176 songs | the catalogue files `Beatles`, `Kinks`, `Housemartins` without it, and folding punctuation cannot fix a missing word at the front of a key |
| strip a trailing parenthetical |  33 songs | `Un-break my heart (original)`, `Country roads (remix)`                                                                                    |

**What the dump cannot do is enrich.** It carries no works, composers, release dates, aliases or genres. Its chosen
release is frequently a karaoke compilation — 33 matches land on things like `Svenska Karaokeklassiker Vol. 3` — so
a year must never be read from it. Its artist credit is release-specific too: `Hall & Oates` stays `Hall & Oates`,
but the MBID behind it resolves to `Daryl Hall & John Oates`, so canonical names have to come from the id and not
the string. Nine songs match `[Disney]`, so bracketed placeholder credits still need discarding, and the 90 prefix
matches need review — one reached Madonna's `Secret (Some Bizarre mix)` from `Secrets` by coincidence.

### So the shape of the work changes

| Stage                          | Cost                             | Produces                                                                                                                                                   |
| :----------------------------- | :------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| offline match against the dump | 45 seconds, no requests          | identity and canonical titles for 88% of the catalogue                                                                                                     |
| web service for the residue    | **506 artist strings**, not 2080 | the typos and abbreviations the dump cannot fold: `Rozallo`, `Zuchero`, `Sugabab`/`Sugarbabes`, `Pink` for `P!nk`, `Lena PH`, `Paul Simon & Art Garfunkel` |
| enrichment by MBID             | 1644 artists plus works          | years, works, composers, languages, genres                                                                                                                 |

That removes about three quarters of the crawling, and the enrichment that remains is direct lookups by id rather
than searches, which are both faster and exact. It also means the evidence-and-judgement pipeline above is aimed at
506 hard strings instead of the whole catalogue, which is where it was always going to be worth the most.

## Is another database worth using?

Asked whether MusicBrainz's limitations argue for a different source, I tested the plausible ones against cases
where I already knew the answer. The short version: **MusicBrainz stays primary, and its own dump fixes the
limitation that actually hurt.** But two other sources are worth adding for specific fields.

_Tested_ on the 10 Nordic tail entries MusicBrainz had resolved:

| Source                        |    Found | Notes                                                                          |
| :---------------------------- | -------: | :----------------------------------------------------------------------------- |
| MusicBrainz                   |    10/10 | plus works, composers, first-release dates, aliases, languages; CC0 with dumps |
| iTunes Search                 |     8/10 | no key needed, always returns a genre and a year, tolerant of messy titles     |
| Deezer                        |     6/10 | no key needed, thinner on older Swedish material                               |
| ListenBrainz canonical mapper | untested | the hosted version of the dump lookup, but it now answers 401 without a token  |

So the alternatives are not better sources, they are differently shaped ones, and two of their properties are
actively dangerous for us. iTunes' top hit for `Hanna Hedlund – Anropar försvunnen` was **a karaoke cover** by
`Pop Music Workshop`, which is the pollution this document warns about, arriving via the source meant to fix it.
And its years are the year of whatever release it has, so `Lill-Babs – Leva livet` comes back 2000 for a 1960s
recording, where MusicBrainz's first-release date is the thing we actually want. Its genres are coarse and
sometimes just wrong — `German Pop` for Lill-Babs, `Worldwide` for Kalle Moraeus.

Where another source would genuinely add something MusicBrainz lacks:

- **Genre.** Discogs is the strongest candidate: 151 M tracks against MusicBrainz's 51 M, a curated genre and style
  taxonomy rather than user tags, CC0, with its own dumps. This is the one gap the alternatives clearly win.
- **Translated titles and original-versus-cover.** SecondHandSongs is purpose-built for it, which is what would let
  someone find `Stilla natt` by typing `Silent Night`. MusicBrainz works cover some of this.
- **Composer credits.** The CISAC-affiliated repertory searches (Sweden's STIM, ASCAP's ACE) are the authoritative
  registries and carry alternate titles per distribution channel.
- **Duet still has no source.** Nothing on that list records who sings which part. It stays a human-curated flag.

Neither Rate Your Music (no API, scraping prohibited) nor AllMusic (no API) is usable. Streaming catalogues would
mean OAuth credentials for a worse answer.

## Cost and rate limits

MusicBrainz allows **one request per second**, needs no API key, and requires a meaningful User-Agent. It is
free for non-commercial use. _Tested:_ 503s occur even at that rate, so the client needs retry with backoff and
should pace itself slightly slower than the limit.

_Measured on the pilot:_ an artist costs **11 requests** and a request takes **about four seconds** end to end —
the 1.2 s we wait between requests plus one to three seconds of search latency, which is the larger half. So the
artist pass over 2080 strings is on the order of 23000 requests and **around 25 hours**, not the five hours
estimated before anything was measured. The song pass adds roughly one scoped lookup each.

Two things bring that down. Title-only search is only collected when nothing else corroborates, which removes
three of the eleven requests for most artists. And the 1278 single-song artists need fewer corroborations than
the ones with a dozen titles. It stays an unattended background job either way, and because every response is
cached, re-runs and prompt changes cost nothing.

### Concurrency cannot make this faster

The limit is measured **per source IP address**, and exceeding it does not shed the excess — it rejects
everything:

> if your requests are coming in at 4 requests per second, we don't honour 25% of them and decline the other
> 75% — we decline 100% of them, until the rate drops to 1 per second or lower

So splitting the walk across several workers on one machine makes it strictly slower, and the documented
consequence of pushing it is having the IP blocked from the API entirely. Five hours is a floor set by
MusicBrainz, not by us.

What concurrency does help with is everything that is not a request. Keep one fetcher that owns the entire
request budget and writes to the cache, and let any number of workers reason over what it has already fetched.
That split is worth having anyway: it is what makes the job resumable, and what makes re-running the judgement
step against different prompts free.

If the wall clock ever genuinely matters, the answer is a local mirror of the MusicBrainz database rather than
more workers, which removes the limit but costs a large database to import and keep current.

## What the pilot showed

Rather than start on 2080 artists, the approach was tried on 50 — `data/pilot/artists.txt`, covering 432 songs,
weighted towards the cases known to be hard, with unambiguous controls mixed in so that false positives would be
visible and not just misses. `data/pilot/expectations.json` records what I thought the answers were, written from
the evidence before any model saw it, and `pnpm score:verdicts` checks a run against them. The expectations are my
judgement, not ground truth, and the cases where I do not think there is one defensible answer are marked
observe-only.

Collecting the evidence took 557 requests. Grok 4.5 then judged it with no network access of its own and **passed
all 89 scored assertions**: it left all seven acts whose names merely contain a separator intact, split all five
real collaborations, converged all five case-variant pairs on a single entity, and refused all six strings that
are not artists. It resolved `Chicago` to the band rather than the musical, which only the song titles can settle,
and stripped the annotation from `Enya (fellowship Of The Ring Soundtrack)`. On the observe-only cases it found
the trio entity behind `Kikki, Bettan och Lotta` and `Rosie & the Originals`, and called the singer-versus-band
slash cases ambiguous instead of picking one.

So the design works, and the expensive part is the fetching rather than the judging.

**It was also confidently wrong about something.** Asked to critique the evidence, it reported that the title-only
search was empty for essentially every entry. It was populated for 49 of 50. Everything else it raised checked
out, which is the point worth keeping: a model can be right about the substance of every case and still make a
firm, false claim about its own input. Spot-checking a sample of `resolved` records is not optional.

Its accurate criticisms were three ways the evidence could mislead, each confirmed against the data and now fixed
in the collector:

| Trap                                                                                        | Evidence                                                                                                     | Now                                        |
| :------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------- | :----------------------------------------- |
| The recording search matches supersets of a title, so a hit is not proof                    | `Please don't go` returns `Baby Please Don’t Go`, appearing to corroborate The E Street Band. 3 of 117 hits. | marked `looseMatch`                        |
| Tribute and covers acts have recorded the same songs                                        | `AC/DC UK` matches all three AC/DC titles                                                                    | 11 candidates carry `likelyTributeOrCover` |
| MusicBrainz placeholder entities score 100 against exactly the strings that are not artists | `[Disney]` matches two Disney titles                                                                         | 4 candidates carry `specialPurpose`        |

The last two matter because they defeat the corroboration trick that the rest of this document leans on. Grok
avoided all three unprompted, but on 2080 artists nobody will be reading each case, so the signal belongs in the
evidence rather than in a model's care.

One mechanical result is worth more than the model comparison. Asking only whether _any_ candidate that is neither
a placeholder nor a tribute act cleanly has the venue's songs identified **exactly the six strings that are not
artists**, with no false positives and no misses. That is a cheap arithmetic test over data we already fetch, and
it means judgement is only needed for a remainder, not for the catalogue.

### And on a sample nobody curated

The 50 were chosen by me, so passing them partly measures which cases I thought of. 1278 of the 2080 artist
strings have exactly one song, which is the population where corroboration is weakest — one title either hits or
it does not, with none of the 3-of-3 against 0-of-3 contrast that settles the multi-song cases. So
`data/pilot/tail-artists.txt` takes 60 of them chosen by hashing the name, which is reproducible and not curated.

**56 of the 60 corroborated cleanly, with no judgement involved.** The four that did not are the useful part, and
none of them is an artist-identification failure:

- `Little Mermaid` and `Fiddler on the roof` are a film and a musical. Not artists, which is the right answer.
- `Loa Falkman` and `Lou Bega` are both the top candidate at score 100 with an exact name match. What failed was
  the title: the venue writes `Mambo No5` where the canonical title is `Mambo No. 5`, and `Symfoni` where Falkman's
  Melodifestivalen entry is `Symfonin`. Neither survives a phrase search. **Both records were in MusicBrainz all
  along** — see below — so this was our query, not their data.

So the tail's weakness is **titles, not artists**, and the artist pass can be trusted across the whole catalogue.
That relocates the remaining risk onto the song pass, which is both the larger job — 5915 lookups against 2080 —
and the one where the venue's own formatting fights us: 84% of multi-word titles are sentence-cased, and the
sample also turned up parenthetical annotations (`Part of your world (Disney)`, `Bella Notte (english)`) and lost
punctuation (`Mambo No5`). `Part of your world (Disney)` returned nothing at all, not even a wrong answer. Title
normalisation therefore has to happen before the song pass, not after it.

### Revised cost, measured per bucket

A single-song artist costs 5.6 requests, not the 11 the adversarial set averaged, and the tail ran at 2.45 s per
request. The artist pass is therefore about **14800 requests and 10 to 12 hours**, not 25.

It also does not have to be one job. Ordered by how many songs an artist covers, each chunk is independently
useful and the work is banked as it goes:

| Chunk                      | Requests | Time | Catalogue covered |
| :------------------------- | -------: | ---: | ----------------: |
| 128 artists with 10+ songs |     1400 |  1 h |               37% |
| 271 with 4-9               |     3000 |  2 h |               63% |
| 403 with 2-3               |     3200 |  2 h |               78% |
| 1278 with 1                |     7200 |  5 h |              100% |

The table above is what the artist pass costs through the web service, and it is now the fallback rather than the
plan. The offline match does the same work for 88% of the catalogue in 45 seconds, so these figures apply only to
the 506 strings it cannot fold — roughly a quarter of the crawl, and the quarter that most needs judgement.

## Asking about a hundred things at once

Every cost estimate above assumed a request per entity, and that assumption was wrong. Search takes a Lucene
query, `arid` and `rid` are queryable fields, and a query may be a disjunction, so
`arid:(id1 OR id2 OR … id100)` returns a hundred artists in one request. The 1670 artists the match identified
cost **39 requests and 95 seconds**, with no retries, where 1670 lookups spent their time on 503s and were
heading for three hours.

That is worth stating plainly because it is the difference between a plan and a pipeline: the per-entity
enrichment this document budgeted hours for is minutes. The same trick works for recordings, and for compound
conditions — `(arid:X AND recording:"T") OR (arid:Y AND recording:"U")` is a legal query.

It is not free of a catch. A search page returns a hundred results ranked by relevance, so the members of a batch
compete for the same hundred slots. Batching ids is safe, because each id matches exactly one entity. Batching
conditions is not: at five artist-and-title pairs per query, a fifth of the pairs are crowded out by popular
songs with hundreds of matching recordings. The right response is not to give up the batching, since five pairs
still date 2.75 recordings per request against a single pair's 1.0, but to make a wide pass first and then narrow
passes over what it missed.

### Genres, from tags and MusicBrainz's own vocabulary

This document proposed getting genre from Discogs, on the grounds that MusicBrainz's genres are sparse. They are
sparse as _genres_; they are not sparse as _tags_. Artist search returns raw tags with vote counts, and 98 of the
first 100 artists have some. The trouble with tags is that they are not all genres: U2 is tagged `alternative
rock` and also `irish`, `ireland` and `dublin`.

MusicBrainz publishes the genre list it recognises, all 2184 of them, at `genre/all`. Intersecting an artist's
tags with that list keeps `britpop` and drops `british`, for the cost of paging through the vocabulary once.
**1424 of 1670 artists** come back with at least one genre, which covers **4469 songs**. Discogs is no longer
needed for a first cut.

Genres are per artist, not per song, which is the honest limit of this: it puts `pop` next to a jazz standard on
a pop singer's album. Per-song genre would need the recording's own tags, which are far sparser.

### The year is not the recording's date

The obvious way to date a song is to ask the recording we matched, and it is wrong often enough to be useless.
The canonical dump picks whichever recording its own scoring liked, and for `Girls and Boys` that is a 2000
reissue, for `No Scrub` a 2013 compilation, and for `'74-'75` an acoustic re-recording from 2003. Those dates are
correct about the master and say nothing about the song.

The question that gives a useful answer is _what is the earliest release of this title by this artist_, which is
a search rather than a lookup, filtered to the recordings whose title is exactly the song. That filter is the
important part: remixes, live takes and extended mixes are separate recordings with longer titles, and letting
them in is how a 2019 live version becomes a song's release year.

One systematic error survives, and it is worth knowing about. Where the venue's title is a misspelling that
MusicBrainz also holds as a genuine later recording, the year follows the later recording: the catalogue's
`Girls just wanna have fun` matches Cyndi Lauper's mid-90s re-recording under that spelling rather than the 1983
`Girls Just Want to Have Fun`. The title is right, the artist is right, and the year is twelve years late.

The measured rate of that, and of the related case where the earliest _dated_ release of a title is a reissue, is
about 7%: of the 1341 dated songs whose artist has an end date, 94 carry a year after it. Some of those are the
error and some are the test misfiring — a compilation can legitimately postdate a band's dissolution, and
MusicBrainz has more than one artist called Chicago — but it is the right order of magnitude to quote. A year
before the artist existed is rejected outright, since that one is impossible rather than merely suspicious.

The distribution is a good sanity check in its own right. It peaks in the 1990s and 2000s, tails off through the
1970s and 60s, and has 58 songs before 1960, which is what a karaoke catalogue should look like.

Coverage is the argument for the wide-then-narrow order. The wide pass at five pairs to a query dated 76% of the
recordings for 1041 requests; a narrow pass at two pairs over just the gaps took that to **97%** for 660 more.
Neither would have been a good way to do the whole job on its own.

## Naming an artist does not require matching their song

Correcting song by song produced a result worse than leaving the data alone, in one specific way: an artist could
end up under two spellings at once. Thirty-one of ABBA's songs matched and said `ABBA`; `Winner takes it all` did
not match and said `Abba`, four rows away. A-teens split three ways across three songs.

The mistake was tying identity to the title. Who an artist is does not depend on any one of their songs matching,
so the artist string itself is the unit to resolve: take the artist from that string's other songs and apply it to
all of them. That fixes the inconsistency and improves 121 songs whose titles we still cannot place.

It has to read from the string's **solo** matches only. A collaboration says nothing about who the string names on
its own — the venue files duets under one member, so `Celine Dion` credits Frank Sinatra on one song — and a
string that is _only_ ever a collaboration must be left alone, since resolving it to its lead would silently drop
a collaborator.

### One string, several solo artists, and one of them is wrong

Falling out of that grouping is the best wrong-match detector we have. MusicBrainz is full of different acts
sharing a name, and when a string resolves to more than one of them, the minority is usually the error:

| The venue said   | It matched                                  | It meant |
| ---------------- | ------------------------------------------- | -------- |
| `Pink – So what` | Pink, a German electronic netlabel musician | P!nk     |
| `Mika – Relax`   | Mika, an Austrian house duo                 | MIKA     |

Both are exact combined-key matches, so no amount of string scoring would have caught them; only the artist's
other eighteen and six songs do. The majority act wins and the minority goes to review. A tie is left alone,
because `Emilia` splits one song each between two entities that are the same woman before and after a change of
name.

A band and its own frontman have to be exempt, or the rule fires on Bob Marley & The Wailers, which is if anything
the better credit for `No woman no cry`. Their names give them away: one begins with the other, which two
unrelated people called Pink never do.

## The venue drops leading articles from titles too, not just artists

The article rule earned for artists — the catalogue files The Beatles and The Kinks without it — applies just as
well to titles, and nobody thought to try it there. `Winner takes it all`, `Little time`, `Zephyr song`, `Glory of
love`, `Dark end of the street`: 25 songs, recovered by generating the same variants on both halves of the key
rather than only on the left.

Below seven characters a title gets no edit budget at all, because at that length a single substitution is
usually a different song — `Stay` is one edit from `Say`. A **transposition** is not like that. Swapping two
adjacent characters is a slip of the fingers, and no real title is the swap of another, so it is safe exactly
where a substitution is not. Inside an artist's own catalogue it finds Madonna's `Vouge` and nothing else.

## What is left, and why matching cannot fix most of it

The queue is [`data/review.md`](../data/review.md), generated with everything else. It is grouped by what is
wrong, because those are different jobs, and within that by the venue's artist string, largest group first, since
one decision about `Finsk musik` settles thirty-nine songs and one about `Rozallo` settles one. Each row carries
the `postId` a proposal is keyed by and the `id` on the wall.

Most of what used to look like “obvious typos of famous artists” in that queue were real matching gaps, not
judgement failures: `Clean Bandit ft Zara Larssn` never reached Clean Bandit because the lead was only known from
other collaborations, `Nanne Grönwall` is filed by MusicBrainz as the mononym `Nanne`, and `Colby Caillat` has no
other trusted song to fuzzy-match from. A title-first pass, lead indexing from matched collaborations, and a
second scoped pass after title-first now clear those. The queue is down from 460 to **265**:

| Songs | What it is                                                                                                                                              |
| ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   121 | The artist string is not an artist. `Finsk musik` (39) and `Julsång` (19) still dominate; Italian and several shows were proposed and mostly confirmed. |
|    50 | The artist is known and has no such title, which usually means the venue credited the wrong performer.                                                  |
|    50 | Matched through the lead artist (or title-first via the lead), with a collaborator dropped.                                                             |
|    28 | A prefix match too weak to apply.                                                                                                                       |
|    13 | MusicBrainz files it under a bracketed placeholder, which is a real id but not a person.                                                                |
|     3 | Credited to a namesake.                                                                                                                                 |

The interesting residual group is still wrong attribution — the strings are fine, the performer is not — which is
what the proposal layer below is for.

## Titles that name the film they came from

A prefix match onto `Girls Talk Boys (from "Ghostbusters" original motion picture soundtrack)` was grading as a
version match and then publishing the soundtrack annotation as the title. `from` is now treated as a version
marker alongside mix/remix/live, so the published title is `Girls Talk Boys` and the film is recorded in `from`.

The same leakage happens on the artist column: `Enya (fellowship Of The Ring Soundtrack)` is Enya, from
The Fellowship of the Ring. Parentheses that look like soundtrack/film notes are stripped from the artist
string before matching (while `Chess (Linda Eder)` is left alone, because that names a performer).

## Title-first, for artists with no other trusted song

Pass 2 can only scope by an artist it has already identified. A misspelled solo artist with one song —
`Alannah Miles`, `Colby Caillat`, `Art Garfunkle` — never gets there. The title-first pass starts from an exact
title and asks whether the dump credit is close enough to the venue's artist string (edit distance, shared
prefix for mononyms like `Nanne`, or a lead that heads the credit). Short titles stay stricter, because `Go` and
`Stay` collide constantly.

Matched collaborations now also teach their lead: once `Clean Bandit feat. Sean Paul & Anne-Marie` matches,
`Clean Bandit ft Zara Larssn` can be lead-scoped. After title-first identifies new artists, a second scoped pass
picks up the rest of their catalogue — that is how `Kygo – Higher love` lands once Firestone has named Kygo.

Wrong billing order is a separate failure: `Ed Sheeran Ft. Eminem – River` is Eminem feat. Ed Sheeran on the
dump, so lead-scoping rejects it. When two or more named fragments are already known, a collab-scoped pass
requires every one of them on the credit and ignores order — which also needs the featured artists from earlier
matches to be indexed from the credit line (`Bruno Mars ft Cardi B` → Cardi B).

## Who works the review queue

An agent can do most of it, and the reason is not that it guesses well. It is that a guess and a
correction can be kept separate: `data/proposals.json` holds hypotheses, and a proposal does
nothing but add keys for the matcher to look for. It takes effect if and only if MusicBrainz
turns out to hold that artist with that recording. A wrong guess finds nothing and changes
nothing, which is what makes it safe to let something fallible write that file. Proposals are
also ranked below every rewriting, so one can never overrule the catalogue's own strings.

What an agent is genuinely good at here is generating the hypothesis, because the failures are
not string problems and world knowledge is the only thing that reaches them:

| The venue said                                             | What it is                         | Why matching cannot get there                                                                        |
| ---------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Lena PH`                                                  | Lena Philipsson                    | An abbreviation. No edit distance spans it.                                                          |
| `Goo Goo's`                                                | The Go-Go's                        | String distance prefers Goo Goo Dolls. The _songs_ decide: `Our Lips Are Sealed`, `We Got the Beat`. |
| `Chris Daughtry`                                           | Daughtry                           | The frontman's name for the band's.                                                                  |
| `Grease`                                                   | John Travolta & Olivia Newton-John | The label is a film, and the cast is not in the string.                                              |
| `George Harrison – Nothing's gonna change my love for you` | Glenn Medeiros                     | Both strings are spelled correctly. The attribution is wrong.                                        |

`Goo Goo's` is the one to keep in mind: fuzzy matching would confidently reach the wrong band,
and the only thing that says otherwise is knowing whose songs those are.

### What a pilot of 54 proposals did

48 were confirmed by the dump and applied; 6 found nothing and cost nothing. The failures are
honest about where the method is weak — all three Finnish guesses were wrong, which is exactly
the repertoire the venue's own staff know and an English-language model does not:

| Proposed                                     | Outcome                                                   |
| -------------------------------------------- | --------------------------------------------------------- |
| `Kaduilla tuulee` → Eppu Normaali            | Not found. Finnish repertoire is the weakest area by far. |
| `Myrskyn jälkeen`, `Viidestoista yö` → Dingo | Not found.                                                |
| `Listen with Your Heart` → Linda Hunt        | Not found; the credited performer is someone else.        |
| `What is youth` → Glen Weston                | Not found.                                                |
| `Edelweiss` → Christopher Plummer            | Not found — but the song matched anyway, see below.       |

One effect was not designed and is worth keeping. Confirming three `Sound of Music` proposals
made Julie Andrews a trusted credit for that artist string, and the artist-scoped pass then
found `Edelweiss` under her without being asked. Naming an artist once pays for their whole
catalogue.

### A show is a fact about the song, not its artist

The first version of this resolved `Grease – Summer nights` to `John Travolta & Olivia
Newton-John` and stopped there, which is right about the performers and wrong about the
catalogue: it deleted the only word anyone would search for. The venue put a show in the artist
column because it had nowhere else to put one.

So a proposal can name the show as its own field, travelling beside the artist rather than
competing with it. Where the venue only said `Disney`, the proposal names the film, so three
songs are now from Mary Poppins, Mulan and Pocahontas rather than from a studio. Twenty songs
across seven shows.

That leaves the venue's original label useful for exactly what it was doing — being searched
for — while the artist column says who sings. It also generalises: a category is a fact about a
song, and `Julsång` wants the same treatment rather than an invented performer.

### What is still not an agent's decision

- **Which recording the venue's backing track imitates.** `Edelweiss` verified as Julie Andrews,
  but von Trapp sings it in the film. Both are real; only the venue knows which its track is.
- **The traditional repertoire.** `Julsång` (19 songs) and `Italian` (15) are mostly carols and
  Neapolitan standards with no single performer to find. Inventing one would be worse than
  leaving the label alone; these want a category, not an artist.

So the division is: the agent proposes and the dump adjudicates, the venue rules on intent, and
`data/overrides.json` stays the place for anything the dump cannot confirm but a human knows.

## A collaboration is its artists, not a band with a long name

The artist column is a list of distinct artists, comma separated, each of which should become
its own link. That is not what a credit line is. The dump gives one flattened string per
recording — whatever the matched release printed — and using it as the artist went wrong in
three ways at once: two people read as a band with a long name, the same pair was spelled
differently from one song to the next (`Nicole Kidman and Ewan McGregor` on `Come What May`,
`Nicole Kidman & Ewan McGregor` on `Elephant Love Medley`, identical ids behind both), and the
page was handed a string to parse instead of artists to link.

So the column is built from the credited artists' own canonical names. Song 4096 reads `2Pac,
K-Ci & JoJo`, where the ampersand belongs to one duo's name rather than joining two artists —
which is the whole reason the join has to come from the id list and not from punctuation. Every
matched song carries its artists individually now, not only the collaborations.

Canonical names inside a collaboration come free with it: the venue's `Christina Aguilera, Lil
Kim, Mya & Pink` are Lil' Kim, Mýa and P!nk.

### The credit line is kept as data

MusicBrainz does distinguish a guest from an equal billing, and the dump flattens that
distinction into the credit line — `feat.`, `duet with`, `vs.`, and Swedish `med`. That is worth
keeping and not worth guessing at from punctuation, so the line is stored beside the artists and
never displayed. Recovering the distinction properly means asking the web service for artist
credits, which returns each artist with its join phrase; that is a later enrichment pass, not a
parsing problem.

### A name has to be typeable

MusicBrainz's canonical name is the artist's own preferred one, which for `Άννα Βίσση` and
`鄭秀文` is written in a script nobody in the room can type. Where the canonical name has no
Latin letters at all, a Latin alias is the usable name, and MusicBrainz lists Anna Vissi and
Sammi Cheng among them. A symbol is not a script, so `98°`, `A★Teens` and `Florence + the
Machine` keep theirs.

## Reaching a collaboration through its lead

A collaboration the venue wrote as one string is nobody: `2 Pac feat. KC & Jo Jo` matches no key
and has no other songs to be identified from. Its lead does. 177 of the 489 remaining misses had
a collaboration-shaped artist string and 111 had a lead already identified elsewhere, so
splitting on the first join word and scoping the title search to the lead places 95 of them.

Because the credit then comes from MusicBrainz rather than from the venue, it also corrects what
the venue got wrong inside the collaboration: `Wyclef Sean` is Wyclef Jean, `Clive Griffith` is
Clive Griffin, `Regina Bell` is Regina Belle, and DJ Sammy's guest is Do rather than Fido.

Two guards make it safe to trust:

- **The lead must be the lead**, not merely present in the credit. Six matches were wrong that
  way, and the instructive one is `Peabo Bryson & Regina Bell – A whole new world`, which landed
  on a Koda Kumi cover that features him. With the guard it finds the recording it means.
- **A dropped collaborator is reported.** Scoping to the lead can land on the lead's solo
  recording, so `Ashanti & Ja Rule – Happy` becomes Ashanti alone. The canonical names, year and
  genres still beat the venue's string, so those 26 are applied and listed for review rather
  than withheld.

## The published title is not always the matched one

A prefix match onto a bracketed suffix was applying that suffix as the title, so the site read
`Lady Marmalade (Thunderpuss club mix)`, `Stronger (instrumental)` and `’74-’75 (acoustic)`. It
was also dating those songs from the remix, which is the very error the dating pass exists to
avoid.

The suffix cannot simply be dropped, because plenty of them are the title: `Exhale (Shoop
Shoop)`, `The Ketchup Song (Aserejé)`, `Ain't Goin' Down ('til the Sun Comes Up)`. What
separates them is whether the bracket names a master — mix, remix, instrumental, acoustic, live,
karaoke, backing track, reprise and so on — so that is the test, and it is applied once in the
matcher so that the title shown and the title dated cannot drift apart. 52 titles lose a marker;
the genuine subtitles keep theirs.

## Order of work

Done, and live on the site:

1. **Match offline** against the canonical dump. Identity and canonical titles for 89% of the catalogue in 90
   seconds, no requests. Prefix matches are graded by what the canonical title has that the venue's does not — a
   bracketed version marker, two stray characters, or something else — and only the first two are applied.
   Bracketed placeholder entities are excluded by their own name.
2. **A second pass scoped to the artists the first pass identified**, matching on title alone, then a third
   allowing a bounded edit or a transposition. This is where the venue's typos live: `Sugarbabes`, `Rozallo` and
   `Pink` for `P!nk` never match a combined key, but their other songs did.
3. **Enrich by id, in batches**: canonical names, sort names, aliases and genres for 1672 artists in 39 requests.
4. **Date the songs** by earliest exact-title release per artist.
5. **Resolve each artist string once**, from its solo matches, and apply the result to that string's songs whether
   or not they matched individually. This is what keeps one act under one spelling, and what turns a namesake into
   a flag instead of a correction.
6. **Reach a collaboration through its lead**, where the venue wrote several artists into one string. 95 songs, and
   it corrects the venue inside the collaboration too: `Wyclef Sean` is Wyclef Jean.
7. **Propose, and let the dump adjudicate**, for the songs no rewriting reaches. 48 of a 54-proposal pilot were
   confirmed and applied; the 6 that were not changed nothing. A later pass added further proposals for remaining
   review-queue songs (title typos, wrong attributions, shows filed as artists); the dump confirmed most of them.
8. **Title-first and re-scope.** Exact title plus a close-enough artist credit recovers misspelled artists with no
   other trusted song; indexing leads from matched collaborations and re-scoping after title-first recovers the
   rest of those artists' catalogues. Soundtrack `(from …)` suffixes are stripped from published titles.

That places the large majority of the catalogue: corrected titles and artists, genres, and dates where the dump
and web service agree. Regenerated counts live in `data/review.md` and the matcher's own summary.

Still to do:

9. Work what remains in [`data/review.md`](../data/review.md), biggest group first — especially `Finsk musik` and
   `Julsång`, which want a category rather than an invented performer — into `data/proposals.json` where the dump
   can confirm a guess and into `data/overrides.json` where it cannot.
10. **Ask the web service for artist credits**, so that a guest can be told from an equal billing by its own join
    phrase rather than by parsing the flattened credit line the dump provides.
11. Works and composers, for the songs where the writer matters more than the performer.
12. Artist pages, which are the reason for all of the above. Every matched song already carries its artists
    individually, with their ids, so the page has what it needs to link them one by one.

Favourites, playlists and login are a separate concern and want a real database. The catalogue itself should stay
as files in the repository: it is small, it wants to be diffable, and it makes the build depend on nothing.
