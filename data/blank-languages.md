# Songs still missing a lyrics language

Hand list of catalog rows with no composed `language` after the researched override pass (PR #38). Prefer leaving these blank over guessing a version.

**Artist is the composed catalog credit** (`override` then `resolved`, then the venue scrape). Venue filings that were already re-attributed in `data/proposals.json` are not listed here as “wrong artist” leftovers — those now have a language.

Catalog language is `override.language`, then the resolver language (`nob` / `nno` compose to `nor`). These 20 have neither. This file is human-written; no script updates it.

| postId | Catalog artist | Catalog title | Why still blank |
| --- | --- | --- | --- |
| 47851 | Air Supply | Changes | Likely their song *Chances*, not *Changes*. No trusted Air Supply recording of this title. |
| 47917 | Alicia Keys | Piano And I | *Songs in A Minor* intro: piano (Beethoven) plus a spoken interlude, not a sung lyric song. |
| 47965 | Ana | We Are | Dump landed on Now 9. Does not identify Ana Johnsson vs another Ana. |
| 47981 | Andrew Lloyd Webber | Phantom of the Opera | Composer credit, not a performer. English vs other-language productions. |
| 49086 | Coolio | Interlude | ~1-minute spoken skit on *My Soul*, not a sung song. |
| 49215 | Jon Secada | Angel | Venue *Dana Secada / Angel queen*; proposal named Jon Secada. Dump recording is *Ángel* (Spanish exists alongside English *Angel*). Language fork. |
| 49271 | Debbie Smith-Tebay | Follow your road | Unmatched. No public recording or lyrics found. |
| 49678 | Ellinor | Kokobom | Unmatched. No verified recording or lyrics. |
| 49933 | Faith No More | I’m Easy | Faith No More covered the Commodores' *Easy* (titled *Easy* on *Angel Dust*). *I'm Easy* is a different song (Keith Carradine). |
| 50281 | Green Day | The Simpsons Theme | 2007 theme cover: instrumental punk plus the show-name sting, not sung verses. |
| 50290 | Getty Domein | Yeba | Venue Gretty Domein. Lyric language not independently verified. |
| 50326 | Hair | Aquarius | Musical credited as the artist. English original vs Swedish (and other) productions. |
| 50360 | Helena Paparizou | Mambo | Greek vs English versions (including on *The Game of Love*). |
| 50733 | Estelle feat. John Legend | You Are | Venue *John Legend / Hey girl*. Proposal remapped to *You Are*, but Estelle also recorded a different *Hey Girl* with Legend. Title not definite. |
| 50846 | *(traditional)* | Julmedley | Venue Julsång. Traditional Christmas medley; override has no language (no single lyric language to assign). |
| 51348 | Luca feat. Deejay Jay | Bachi Bachi | Lyric sources are messy and multilingual. Language not definite. |
| 51874 | Nickelback | Hero | Chad Kroeger feat. Josey Scott, not Nickelback. The correctly credited row (48869) is already tagged. Proposal did not re-attribute this listing. |
| 52770 | Shirley Bassey | This Is My Life | English vs Italian *La vita* fork. |
| 52889 | Stan Getz | The Girl from Ipanema | Instrumental sax vs Getz/Gilberto vocal (Portuguese and/or English). Version-ambiguous. |
| 52920 | Steve Kolander | Black Dresses | No public lyric text found. |
