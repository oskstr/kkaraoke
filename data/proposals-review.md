# Proposal review

414 songs, written by `pnpm build:resolved` from `data/proposals.json` and
the venue scrape. Regenerable, so do not edit it — change the proposal instead.

Each row is what the venue had, then what the proposal asked MusicBrainz to confirm.
A proposal only sticks when the dump agrees; `dump` is `yes` when the proposal key won,
`other` when a different key matched, and `no` when nothing matched.

| id | venue artist | venue title | → artist | → title | from | language | dump | why | postId |
| -: | --- | --- | --- | --- | --- | --- | --- | --- | -: |
| 9 | Madonna | Secrets | Madonna | Secret |  |  | yes | Singular studio | 51393 |
| 18 | Elton John | She's a river | Simple Minds | She's a river |  |  | yes | Simple Minds, 1995 | 49679 |
| 34 | Grease | Summer nights | John Travolta & Olivia Newton-John | Summer nights | Grease |  | yes | the duet from Grease | 50269 |
| 39 | Zuchero & Paul Young | Senza una donna | Zucchero & Paul Young | Senza una donna (Without a Woman) |  |  | yes | Zuchero typo; full duet | 53609 |
| 72 | Bill | She wants you | Billie Piper | She Wants You |  |  | yes | Bill truncated Billie | 48328 |
| 101 | Elvis Presley feat. JXL Remix | A little less conversation | Elvis vs. JXL | A Little Less Conversation |  |  | yes | JXL remix | 49767 |
| 103 | Madonna | Die another day | Madonna | Die Another Day | Die Another Day |  | other | James Bond theme | 51394 |
| 128 | Las Ketchup | Ketchup song | Las Ketchup | The Ketchup Song (Aserejé) |  |  | other | Full title | 51142 |
| 171 | Christina Millian | Am to pm | Christina Milian | AM to PM |  |  | yes | one l too many | 49007 |
| 172 | Dynamite | Dy-na-mi-te | Ms. Dynamite | Dy-Na-Mi-Tee |  |  | yes | venue Dynamite/Dy-na-mi-te is Ms. Dynamite's Dy-Na-Mi-Tee | 49570 |
| 177 | Blue & Elton John | Sorry seems to be the hardest word | Blue feat. Elton John | Sorry Seems to Be the Hardest Word |  |  | yes | Both | 48434 |
| 178 | Ashanti & Ja Rule | Happy | Ashanti feat. Ja Rule | Happy |  |  | yes | Both credits | 48067 |
| 245 | Rachel Stevens | Sweet dreams | Rachel Stevens | Sweet Dreams My LA Ex |  |  | yes | Full title | 52307 |
| 259 | Dana Secada | Angel queen | Jon Secada | Angel |  |  | yes | Dana Secada is Jon Secada | 49215 |
| 285 | England Dan & John Ford | I'd really love to see you tonight | England Dan & John Ford Coley | I’d Really Love to See You Tonight |  |  | yes | Full name | 49826 |
| 300 | Roxette | Make it real | The Jets | Make It Real |  |  | yes | Jets not Roxette | 52558 |
| 323 | Paul Young | For you babies | Simply Red | For Your Babies |  |  | yes | Simply Red, 1992 | 52055 |
| 334 | N Sync | Fallen | *NSYNC | Falling |  |  | yes | Fallen→Falling | 51778 |
| 336 | Michael W. Smith | I'll be here for you | Michael W. Smith | I Will Be Here for You |  |  | yes | I Will not I’ll | 51674 |
| 340 | Clair Marlow | Till they take my heart away | Clair Marlo | Till They Take My Heart Away |  |  | yes | Marlow is Marlo | 49014 |
| 425 | Tina Arena & Marc | I want to spend my lifetime loving you | Tina Arena | I Want to Spend My Lifetime Loving You |  |  | yes | with Marc Anthony | 53237 |
| 436 | Century Oldies | The voice of love | Johnny Nash | The Voice of Love |  |  | yes | Century Oldies category | 48867 |
| 448 | Past Oldies | A lover's concerto | The Toys | A lover's concerto |  |  | yes | the 1965 hit | 52027 |
| 456 | George Harrison | Nothing's gonna change my love for you | Glenn Medeiros | Nothing's gonna change my love for you |  |  | yes | Medeiros 1986; nothing to do with George Harrison | 50174 |
| 467 | Past Oldies | Here's a heart | Dave Dee, Dozy, Beaky, Mick & Tich | Here's a Heart |  |  | yes | Past Oldies category | 52028 |
| 480 | Selina | Dreaming of you | Selena | Dreaming of You |  |  | yes | Selina is Selena | 52692 |
| 491 | Century Oldies | What is youth | Nino Rota | What Is a Youth | Romeo and Juliet |  | yes | Film theme | 48868 |
| 499 | Norieve R18 | Just tell me you love me | England Dan & John Ford Coley | Just Tell Me You Love Me |  |  | yes | Norieve R18 not performer | 51906 |
| 517 | Tina Turner | Goldeneye | Tina Turner | GoldenEye | GoldenEye |  | other | James Bond theme | 53238 |
| 536 | Celine Dion | Natural woman | Aretha Franklin | (You Make Me Feel Like) A Natural Woman |  |  | yes | Franklin, 1967 | 48833 |
| 542 | Phil Collins | I'll never fall in love again | Dionne Warwick | I'll never fall in love again |  |  | yes | Bacharach and David; Warwick is the standard | 52128 |
| 547 | George Michael | I who have nothing | Ben E. King | I (Who Have Nothing) |  |  | yes | King popularised it; also Tom Jones — trying King | 50182 |
| 566 | Madonna | Here we are | Gloria Estefan | Here We Are |  |  | yes | Gloria not Madonna | 51408 |
| 567 | Madonna | Reach | Gloria Estefan | Reach |  |  | yes | Gloria not Madonna | 51409 |
| 568 | Madonna | It's too late | Gloria Estefan | It’s Too Late |  |  | yes | Gloria not Madonna | 51410 |
| 601 | Richard Marx | Lady in red | Chris de Burgh | The Lady in Red |  |  | yes | de Burgh, not Richard Marx | 52398 |
| 612 | Elton John | Truly | Lionel Richie | Truly |  |  | yes | Lionel Richie, not Elton John | 49688 |
| 620 | Mariah Carey | Lollipop | MIKA | Lollipop |  |  | yes | MIKA not Mariah | 51472 |
| 639 | Michael Bolton | Go the distance | Michael Bolton | Go the Distance | Hercules |  | other | from Hercules | 51630 |
| 652 | Sertab | Every way that l can | Sertab Erener | Everyway That I Can |  |  | yes | Sertab; every way that l can | 52698 |
| 660 | Miio feat. Ayo | Ska vi gå hem till dig | Miio | Ska vi gå hem till dig... |  |  | yes | feat Ayo | 51679 |
| 691 | Lena PH | Lena anthem | Lena Philipsson | Lena anthem |  |  | yes | Lena PH is how the venue abbreviates Lena Philipsson | 51179 |
| 694 | Lena PH | På gatan där jag bor | Lena Philipsson | På gatan där jag bor |  |  | yes | abbreviation of Lena Philipsson | 51180 |
| 733 | Ola Svensson | Natalie | Ola | Natalie |  |  | yes | MB credits Ola not Ola Svensson | 51956 |
| 734 | Ola Svensson | Sos | Ola | S.O.S. |  |  | yes | MB credits Ola | 51957 |
| 742 | Pink | So what | P!nk | So What |  |  | yes | P!nk not Pink namesake | 52140 |
| 749 | Chris Daughtry | Home | Daughtry | Home |  |  | yes | the band is Daughtry; Chris is its singer | 48958 |
| 754 | Electric Boys | All lips and hips | Electric Boys | All Lips ’n’ Hips |  |  | yes | Canonical title | 49663 |
| 769 | OnklP & Jaa9 | Kjendisparty | Jaa9 & OnklP | Kjendisparty |  | nor | yes | Canonical order | 51986 |
| 777 | Stein og Inger Lise | Bang en boomerang | Svenne & Lotta | Bang en boomerang |  |  | yes | Svenne & Lotta Swedish hit | 52912 |
| 782 | Are & Odin | Klapp klapp | Are og Odin | Klapp klapp |  |  | yes | Canonical duo | 48038 |
| 784 | Inger Lise Rypdal | Nyorelsket 70 År | Inger Lise Rypdal | Nyforelsket 70 år |  | nor | yes | Nyorelsket typo | 50438 |
| 798 | Flamingokvintetten | Sexton år idag | Flamingokvintetten | Hon är sexton år idag |  |  | yes | Venue omitted Hon är | 50005 |
| 814 | Kikki, Bettan och Lotta | Vem e det du vill ha | Kikki, Bettan & Lotta | Vem e det du vill ha |  |  | yes | Trio Melodifestivalen | 51001 |
| 817 | Son of a plumber | C'mon/Jo-Anna Says | Son of a Plumber | Jo-Anna Says |  |  | yes | Per Gessle project; venue filed C'mon/Jo-Anna as medley | 52840 |
| 858 | Rihanna | Oh baby | Rhianna | Oh Baby |  |  | yes | British Rhianna not Rihanna | 52433 |
| 904 | Sarah Dawn Finer | I'm moving on | Sarah Dawn Finer | Moving On |  |  | yes | Drop I’m | 52638 |
| 922 | Fronda | Ingen mår så bra som jag | Sebastian Fronda | Ingen mår så bra som jag |  |  | yes | Full artist credit | 50124 |
| 923 | Ola Svensson | Love in stereo | Ola | Love in Stereo |  |  | yes | MB credits Ola | 51958 |
| 930 | Sebastian | Vågar du vågar jag | Sanna Nielsen | Vågar du, vågar jag |  |  | yes | Swapped with Sebastian | 52681 |
| 931 | Sanna Nielsen | When the night comes falling | Sebastian Karlsson | When the Night Comes Falling |  |  | yes | Swedish Sebastian; swapped with Sanna | 52623 |
| 943 | Kikki Danielsson | Idag och imorgon | Kikki Danielsson | Idag & imorgon |  |  | yes | Ampersand | 50999 |
| 955 | Lena PH | Det gör ont | Lena Philipsson | Det gör ont |  |  | yes | abbreviation of Lena Philipsson | 51181 |
| 970 | Lena PH | Dansa i neon | Lena Philipsson | Dansa i neon |  |  | yes | abbreviation of Lena Philipsson | 51182 |
| 977 | Lena PH | Kärleken är evig | Lena Philipsson | Kärleken är evig |  |  | yes | abbreviation of Lena Philipsson | 51183 |
| 984 | Lasse Holm & Monica Törnell | Är det det här du kallar kärlek | Monica Törnell & Lasse Holm | Är det det här du kallar kärlek |  |  | yes | Melodifestivalen 1986; dump bills Monica first; venue title is the Är-spelling of E' de'… | 51147 |
| 996 | Eriksson & Glennmark | Upp över mina öron | Orup & Anders Glenmark | Upp över mina öron |  |  | yes | Correct credit | 49860 |
| 1009 | Roger Pontare | Vindarna viskar mitt namn | Roger Pontare | När vindarna viskar mitt namn |  |  | yes | Venue omitted När | 52531 |
| 1013 | Rankarna | Det är inte så lätt att va ödmjuk | Mats Rådberg & Rankarna | Det är inte lätt att vara ödmjuk |  |  | yes | Full credit | 52342 |
| 1039 | David Shutrick | Blå container | David Shutrick | Container |  |  | yes | Venue added Blå | 49258 |
| 1055 | Uffe Neidemar | Häng me på party | Ulf Neidemar | Häng me på party |  |  | yes | Uffe is Ulf | 53387 |
| 1066 | Jonas Gardell | Aldrig skall jag sluta älska dig | Jonas Gardell | Aldrig ska jag sluta älska dig |  |  | yes | ska not skall | 50790 |
| 1067 | Cue | Burning | Cue | Burnin' |  |  | yes | Burning is Burnin' | 49192 |
| 1068 | Lars Winnerbäck & Hovet | Hum hum från humlegården | Lars Winnerbäck | Hum hum från Humlegården |  |  | yes | with Hovet | 51139 |
| 1074 | Joakim Thåström | Märk hur vår skugga | Thåström | Märk Hur Vår Skugga |  |  | yes | Canonical solo credit | 50704 |
| 1079 | Cajsa Stina Åkerström | Av längtan till dig | Åsa Jinder & CajsaStina Åkerström | Av längtan till dig |  |  | yes | duet; title-first had wrongly attached a choir | 48744 |
| 1088 | Creeps | Oh I like it | The Creeps | Ooh I Like It! |  |  | yes | Creeps is The Creeps; Oh is Ooh | 49174 |
| 1094 | Abba | I do I do I do I do | ABBA | I Do, I Do, I Do, I Do, I Do |  |  | yes | Fifth I Do | 47761 |
| 1121 | Huey Lewis & Gwyneth Paltrow | Cruisin' | Gwyneth Paltrow & Huey Lewis | Cruisin' |  |  | yes | dump bills Gwyneth first | 50406 |
| 1139 | Hair | Easy to be hard | Three Dog Night | Easy to Be Hard | Hair |  | yes | Hair; popular recording | 50325 |
| 1150 | Goo Goo's | Our lips are sealed | The Go-Go's | Our lips are sealed |  |  | yes | these two songs are The Go-Go's, not Goo Goo Dolls | 50257 |
| 1182 | Black Sabbath | Iron man black | Black Sabbath | Iron Man |  |  | yes | Iron man black | 48393 |
| 1211 | Goo Goo's | We got the beat | The Go-Go's | We got the beat |  |  | yes | The Go-Go's, 1981 | 50258 |
| 1246 | Hello Dolly | Don't rain on my parade | Barbra Streisand | Don’t Rain on My Parade | Funny Girl |  | yes | Funny Girl not Hello Dolly | 50361 |
| 1250 | Jesus Christ Superstar | I don't know how to love him | Yvonne Elliman | I don't know how to love him | Jesus Christ Superstar |  | yes | Mary Magdalene on the 1970 album | 50661 |
| 1318 | Sandy Shaw | Puppet on a string | Sandie Shaw | Puppet on a String |  |  | yes | Sandy is Sandie | 52620 |
| 1329 | Duran Duran | A view to a kill | Duran Duran | A View to a Kill | A View to a Kill |  | other | James Bond theme | 49558 |
| 1370 | Blues Brothers | Everybody needs somebody | The Blues Brothers | Everybody Needs Somebody to Love |  |  | yes | Film band not namesake | 48444 |
| 1379 | Michelle Branch feat. Santana | Game of love | Santana feat. Michelle Branch | The Game of Love |  |  | yes | Santana lead on the recording | 51676 |
| 1419 | Deniece Williams | Let's hear it from the boy | Deniece Williams | Let’s Hear It for the Boy |  |  | yes | Correct preposition | 49294 |
| 1432 | Prince | Most beautiful girl | Prince | The Most Beautiful Girl in the World |  |  | yes | Full title | 52225 |
| 1458 | Robbie Williams & Nicole Kidman | Something stupid | Robbie Williams | Somethin’ Stupid |  |  | yes | with Nicole Kidman | 52489 |
| 1501 | Grease | You're the one that I want | John Travolta & Olivia Newton-John | You're the one that I want | Grease |  | yes | the duet from Grease | 50270 |
| 1601 | Eddie Grant | Gimme hope Joanna | Eddy Grant | Gimme Hope Jo'anna |  |  | yes | Eddie is Eddy | 49647 |
| 1604 | Skinner & Baddiel | Three lions | Baddiel, Skinner & The Lightning Seeds | Three Lions |  |  | yes | Skinner & Baddiel | 52797 |
| 1611 | Fat Les | Vidaloo | Fat Les | Vindaloo |  |  | yes | Vidaloo is Vindaloo | 49952 |
| 1644 | Five | Slam dunk the funk | Five | Slam Dunk (Da Funk) |  |  | yes | Slam dunk the funk | 49999 |
| 1665 | No Doubt | Come on Eileen | Dexys Midnight Runners | Come On Eileen |  |  | yes | Not No Doubt | 51896 |
| 1727 | Steve Harley & Cockney Rebe | Make me smile (Come up and see me) | Steve Harley & Cockney Rebel | Make Me Smile (Come Up and See Me) |  |  | yes | Full band | 52919 |
| 1741 | Jimmy Rogers | English country garden | Jimmie Rodgers | English Country Garden |  |  | yes | Jimmie not Jimmy | 50695 |
| 1773 | Chas & Dave | No pleasing you | Chas & Dave | Ain't No Pleasing You |  |  | yes | No pleasing you | 48898 |
| 1790 | Neil Diamond | Grass won't pay no mind | Neil Diamond | And the Grass Won’t Pay No Mind |  |  | yes | Full title | 51817 |
| 1793 | Bobby Vee | Venus in blue | Bobby Vee | Venus in Blue Jeans |  |  | yes | Jeans | 48521 |
| 1797 | Gracie Fields | Wish me good luck as you wave me goodbye | Gracie Fields | Wish Me Luck As You Wave Me Goodbye |  |  | yes | Correct title | 50266 |
| 1798 | Merseybeats | Wishin' and a hopin' | The Merseybeats | Wishin’ and Hopin’ |  |  | yes | Canonical | 51604 |
| 1827 | Britney Spears | Don't go knocking | Britney Spears | Don't Go Knockin' on My Door |  |  | yes | Don't go knocking | 48618 |
| 1828 | Britney Spears | What you see is what you get | Britney Spears | What U See (Is What U Get) |  |  | yes | Canonical | 48619 |
| 1837 | Samantha Mumba | Body to body | Samantha Mumba | Body II Body |  |  | yes | Roman numerals | 52615 |
| 1854 | Italian | Al di la | Emilio Pericoli | Al di là |  | ita | yes | Italian standard | 50490 |
| 1855 | Italian | Speak softly love | Andy Williams | Speak Softly Love |  | ita | yes | Speak Softly, Love under Italian | 50491 |
| 1857 | Italian | Santa Lucia | Elvis Presley | Santa Lucia |  | ita | yes | common karaoke version | 50493 |
| 1858 | Italian | Ah Maria | Luciano Pavarotti | Ave Maria |  | ita | yes | Italian bucket Ah Maria is almost certainly Ave Maria | 50494 |
| 1859 | Italian | Torna a surriento | Luciano Pavarotti | Torna a Surriento |  | ita | yes | Neapolitan standard | 50495 |
| 1860 | Italian | Nel blu dipinto di blu | Domenico Modugno | Nel blu dipinto di blu |  | ita | yes | Volare | 50496 |
| 1861 | Italian | That's amore | Dean Martin | That's Amore |  | ita | yes | Dean Martin | 50497 |
| 1862 | Italian | Bella senz' anima | Riccardo Cocciante | Bella senz'anima |  | ita | yes | Cocciante | 50498 |
| 1863 | Italian | Che sara | José Feliciano | Che sarà |  | ita | yes | Feliciano | 50499 |
| 1864 | Italian | Funiculi funicula | Luciano Pavarotti | Funiculì, Funiculà |  | ita | yes | Neapolitan standard | 50500 |
| 1865 | Italian | Mala femmena | Renato Carosone | Malafemmena |  | ita | yes | Carosone | 50501 |
| 1866 | Italian | O' sole mio | Luciano Pavarotti | O sole mio |  | ita | yes | Neapolitan standard | 50502 |
| 1867 | Italian | Caruso | Lucio Dalla | Caruso |  | ita | yes | Dalla | 50503 |
| 1873 | Spice Girls | Mi chico latino | Geri Halliwell | Mi chico latino |  |  | yes | Halliwell solo, 1999 | 52873 |
| 1874 | Spice Girls | Lift me up | Geri Halliwell | Lift me up |  |  | yes | Halliwell solo, 1999 | 52874 |
| 1875 | Spice Girls | Look at me | Geri Halliwell | Look at me |  |  | yes | Halliwell solo, 1999 | 52875 |
| 1876 | Spice Girls | Bag it up | Geri Halliwell | Bag it up |  |  | yes | Halliwell solo, 2000 | 52876 |
| 1877 | Spice Girls | Northern star | Melanie C | Northern star |  |  | yes | Melanie C solo, 1999 | 52877 |
| 1878 | Spice Girls | Ga ga | Melanie C | Ga Ga |  |  | yes | Solo not Spice Girls | 52878 |
| 1879 | Spice Girls | Goin' down | Melanie C | Goin' down |  |  | yes | Melanie C solo, 1999 | 52879 |
| 1880 | Spice Girls | What I am | Tin Tin Out & Emma Bunton | What I am |  |  | yes | Bunton with Tin Tin Out, 1999 | 52880 |
| 1881 | Spice Girls | I want you back | Melanie B | I want you back |  |  | yes | Melanie B with Missy Elliott, 1998 | 52881 |
| 1888 | Louis Armstrong | A kiss to build the dream | Louis Armstrong | A Kiss to Build a Dream On |  |  | yes | Omitted On | 51337 |
| 1904 | Engelbert Humperdinck | Am I easy to forget | Engelbert Humperdinck | Am I That Easy to Forget |  |  | yes | Omitted That | 49814 |
| 1939 | Bon Jovi | Living in the sun | Bon Jovi | Living in Sin |  |  | yes | Sun→Sin typo | 48538 |
| 1970 | Don Williams | Gypsy woman | Don Williams | I Recall a Gypsy Woman |  |  | yes | Full title | 49480 |
| 1990 | My Fair Lady | Get me to the church on time | Stanley Holloway | Get Me to the Church on Time | My Fair Lady |  | yes | Doolittle's number | 51771 |
| 1995 | Rosie/Originals | Angel baby | Rosie & the Originals | Angel Baby |  |  | yes | Group credit | 52557 |
| 1999 | Garth Brooks | Ain't goin' down | Garth Brooks | Ain’t Goin’ Down (’Til the Sun Comes Up) |  |  | yes | Full title | 50143 |
| 2000 | Tony!Tony!Tony! | Anniversary song | Tony! Toni! Toné! | Anniversary |  |  | yes | Tony!Tony!Tony! | 53328 |
| 2002 | Jim Croce | Bad bad leeroy brown | Jim Croce | Bad, Bad Leroy Brown |  |  | yes | leeroy is Leroy | 50671 |
| 2067 | Bellamy Brothers | If I said you had a beautiful body | The Bellamy Brothers | If I Said You Had a Beautiful Body Would You Hold It Against Me |  |  | other | Truncated venue title | 48288 |
| 2075 | UB40 | Tears in my eyes | UB40 | Tears From My Eyes |  |  | yes | From not in | 53383 |
| 2083 | Backstreet Boys | If you want to be good girl | Backstreet Boys | If You Want It to Be Good Girl (Get Yourself a Bad Boy) |  |  | yes | full title | 48128 |
| 2124 | Finsk musik | Myrskyn jälkeen | Kari Tapio | Myrskyn jälkeen |  | fin | yes | venue filed under Finsk musik; Kari Tapio's 1995 hit | 49959 |
| 2125 | Finsk musik | Kaduilla tuulee | Jari Sillanpää | Kaduilla tuulee |  | fin | yes | Jari Sillanpää, 1996; language label not an artist | 49960 |
| 2126 | Finsk musik | Matkalla pohjoiseen | Juha Vainio | Matkalla pohjoiseen |  | fin | yes | Juha Watt Vainio, 1981 | 49961 |
| 2127 | Finsk musik | Kuin joutsenlaulu | Kake Randelin | Kuin joutsenlaulu |  | fin | yes | Kake Randelin iskelmä standard | 49962 |
| 2128 | Finsk musik | Viidestoista yö | Juice Leskinen Slam | Viidestoista yö |  | fin | yes | Juice Leskinen Slam, 1980; earlier Dingo guess was wrong | 49963 |
| 2129 | Finsk musik | Vaskikellot | Antti Huovila | Vaskikellot |  | fin | yes | Antti Huovila | 49964 |
| 2130 | Finsk musik | Titanic | Frederik | Titanic |  | fin | yes | Frederik's Finnish Titanic, not Celine Dion | 49965 |
| 2131 | Finsk musik | St pauli ja reeperbahn | Irwin Goodman | St. Pauli ja Reeperbahn |  | fin | yes | Irwin Goodman; venue spelling missed the period | 49966 |
| 2132 | Finsk musik | Linnut | Rainer Friman | Linnut |  | fin | yes | Rainer Friman | 49967 |
| 2133 | Finsk musik | Illan varjoon himmeään | Agents | Illan varjoon himmeään |  | fin | yes | Agents recording of the standard | 49968 |
| 2134 | Finsk musik | Eva | Jippu | Eva |  | fin | yes | Jippu | 49969 |
| 2135 | Finsk musik | Sinisen taivaan sateenkaari | Janne Tulkki | Sinisen taivaan sateenkaari |  | fin | yes | Janne Tulkki | 49970 |
| 2136 | Finsk musik | Moottoripyörä on moottoripyörä | Mika Sundqvist | Moottoripyörä on moottoripyörä |  | fin | yes | Mika Sundqvist, 1980 | 49971 |
| 2137 | Finsk musik | Mahtava peräsin ja pulleat purjeet | Solistiyhtye Suomi | Mahtava peräsin ja pulleat purjeet |  | fin | yes | Solistiyhtye Suomi | 49972 |
| 2138 | Finsk musik | Kaikki tytöt -karakum- | Finlanders | Kaikki tytöt |  | fin | yes | Finlanders; venue appended -karakum- | 49973 |
| 2139 | Finsk musik | Kaikki muuttuu -you can have her- | Four Cats | Kaikki muuttuu |  | fin | yes | Four Cats Finnish take on You Can Have Her | 49974 |
| 2140 | Finsk musik | Aurinko, kuu ja tähdet | Tomi Markkola | Aurinko, kuu ja tähdet |  | fin | yes | Tomi Markkola | 49975 |
| 2141 | Finsk musik | Elämän valttikortit | Ahti Lampi | Elämän valttikortit |  | fin | yes | Ahti Lampi, 1980 | 49976 |
| 2142 | Finsk musik | Juodaan viinaa | Hector | Juodaan viinaa |  | fin | yes | Hector, 1990 | 49977 |
| 2143 | Finsk musik | Kaiken takana on nainen | Matti & Teppo | Kaiken takana on nainen |  | fin | yes | Matti & Teppo | 49978 |
| 2144 | Finsk musik | Lulu | Tuula Amberla | Lulu |  | fin | yes | Tuula Amberla | 49979 |
| 2145 | Finsk musik | Rafaelin enkeli | Pekka Ruuska | Rafaelin enkeli |  | fin | yes | Pekka Ruuska, 1990 | 49980 |
| 2146 | Finsk musik | Jäätelökesä | Maarit | Jäätelökesä |  | fin | yes | Maarit | 49981 |
| 2147 | Finsk musik | Syksyn sävel | Juice Leskinen | Syksyn sävel |  | fin | yes | Juice Leskinen, 1975 | 49982 |
| 2148 | Finsk musik | Krokotiilirock -crocodile rock- | Muska | Krokotiilirock |  | fin | yes | Muska's Finnish Crocodile Rock | 49983 |
| 2149 | Finsk musik | Nummela | Anssi Kela | Nummela |  | fin | yes | Anssi Kela | 49984 |
| 2150 | Finsk musik | Tahdon rakastella sinua | Pelle Miljoona & 1980 | Tahdon rakastella sinua |  | fin | yes | Pelle Miljoona & 1980 | 49985 |
| 2151 | Finsk musik | Teuvo, maanteiden kuningas | Leevi and the Leavings | Teuvo, maanteiden kuningas |  | fin | yes | Leevi and the Leavings, 1988 | 49986 |
| 2152 | Finsk musik | Kevät | Tavaramarkkinat | Kevät |  | fin | yes | Tavaramarkkinat | 49987 |
| 2153 | Finsk musik | Autiotalo | Dingo | Autiotalo |  | fin | yes | Dingo, 1984 | 49988 |
| 2154 | Finsk musik | Bensaa suonissa | Rauli Badding Somerjoki | Bensaa suonissa |  | fin | yes | Rauli Badding Somerjoki | 49989 |
| 2155 | Finsk musik | Märkää rakkautta | Essi Wuorela | Märkää rakkautta |  | fin | yes | Essi Wuorela | 49990 |
| 2156 | Finsk musik | Doris | J. Karjalainen | Doris |  | fin | yes | J. Karjalainen | 49991 |
| 2157 | Finsk musik | Joutsenlaulu | Yö | Joutsenlaulu |  | fin | yes | Yö | 49992 |
| 2158 | Finsk musik | Keskiyön aikaan -I'll meet you at midnight- | Markku Aro | Keskiyön aikaan |  | fin | yes | Markku Aro; Finnish I'll Meet You at Midnight | 49993 |
| 2159 | Finsk musik | Valo yössä | Tuomari Nurmio | Valo yössä |  | fin | yes | Tuomari Nurmio | 49994 |
| 2160 | Finsk musik | Huone 105 | Nisa Soraya | Huone 105 |  | fin | yes | Nisa Soraya original; Kikka covered it later | 49995 |
| 2161 | Finsk musik | Jestas sentään -crazy- | Markku Aro | Jestas sentään |  | fin | yes | Markku Aro; Finnish Crazy | 49996 |
| 2162 | Finsk musik | Linda linda | Frederik | Linda Linda |  | fin | yes | Frederik's Finnish Linda Linda | 49997 |
| 2174 | Moulin Rouge | Come what may | Nicole Kidman & Ewan McGregor | Come what may | Moulin Rouge! |  | yes | the duet | 51749 |
| 2175 | Moulin Rouge | Your song | Ewan McGregor | Your song | Moulin Rouge! |  | yes | McGregor sings it in the film | 51750 |
| 2196 | Björn Skifs/Blue Swede | Hooked on a feeling | Blue Swede | Hooked on a Feeling |  |  | yes | Blue Swede; not the later choir arrangement | 48385 |
| 2256 | Jimmy Buffet | Margaritaville | Jimmy Buffett | Margaritaville |  |  | yes | one t short | 50677 |
| 2260 | Kenny Loggins & Jo Dee Messina | Your mama don't dance | Loggins & Messina | Your Mama Don’t Dance |  |  | yes | Jim Messina not Jo Dee | 50977 |
| 2278 | Garth Brooks | Two of a full kind | Garth Brooks | Two of a Kind, Workin’ on a Full House |  |  | yes | Full title | 50147 |
| 2281 | Aerosmith | Mountain music | Alabama | Mountain Music |  |  | yes | Alabama not Aerosmith | 47831 |
| 2282 | Waylon Jennings | Okie from Muskogie | Merle Haggard | Okie From Muskogee |  |  | yes | Muskogie typo; Merle not Waylon | 53476 |
| 2294 | Manfred Mann | Doo wha diddy | Manfred Mann | Do Wah Diddy Diddy |  |  | yes | Doo wha diddy | 51443 |
| 2307 | Captain & Tenille | Love will keep us together | Captain & Tennille | Love Will Keep Us Together |  |  | yes | Tennille spelling | 48752 |
| 2319 | Jimmy Buffet | Changes in latitude, changes in attitude | Jimmy Buffett | Changes in Latitudes, Changes in Attitudes |  |  | yes | both words are plural | 50678 |
| 2326 | Johnny Nash | The lion sleeps tonight | The Tokens | The Lion Sleeps Tonight |  |  | yes | Tokens not Johnny Nash | 50782 |
| 2335 | Frankie Valli & Four Seasons | December -63 (Oh what a night) | Frankie Valli & The Four Seasons | December 1963 (Oh, What a Night) |  |  | yes | Full group | 50108 |
| 2336 | Bobby Boris Picket | Monster mash | Bobby "Boris" Pickett | Monster Mash |  |  | yes | Picket is Pickett | 48514 |
| 2337 | Mr Rogers | Won't you be my neighbour | Mister Rogers | Won’t You Be My Neighbor? |  |  | yes | Canonical | 51757 |
| 2338 | Grease | Greased lightning | John Travolta | Greased Lightnin' | Grease |  | yes | Travolta's number; the title is elided | 50271 |
| 2357 | LeAnn Rimes | How do I live (original) | LeAnn Rimes | How Do I Live |  |  | other | Drop original MIX | 51160 |
| 2372 | Chess | I know him so well | Elaine Paige & Barbara Dickson | I Know Him So Well | Chess |  | yes | Chess | 48930 |
| 2466 | Kim Fransson | 3 floors down | Kim | 3 Floors Down |  |  | yes | Dump credits Kim | 51015 |
| 2469 | Ola Svensson | Unstoppable | Ola | Unstoppable |  |  | yes | MB credits Ola | 51959 |
| 2479 | Erik Linder | Hur kan jag tro på kärleken | Erik Linder | Hur kan jag tro på kärlek |  |  | yes | Canonical drops -en | 49858 |
| 2501 | Lion King | Hakuna matata | Nathan Lane & Ernie Sabella | Hakuna Matata | The Lion King |  | yes | Lion King OST; Timon and Pumbaa | 51267 |
| 2517 | Jennifer Hudson | And I'm telling you | Jennifer Hudson | And I Am Telling You I'm Not Going | Dreamgirls |  | yes | Dreamgirls film | 50623 |
| 2524 | Alicia Keys & Jack White | Another way to die | Jack White & Alicia Keys | Another Way to Die |  |  | yes | dump credits Jack White first; venue had Alicia Keys & Jack White | 47925 |
| 2555 | Destiny's Child | Independent woman | Destiny's Child | Independent Women |  |  | yes | Canonical title is Independent Women; dump matched a Maurice remix titled Independent Woman | 49338 |
| 2582 | Beyonce | All the single ladies | Beyoncé | Single Ladies (Put a Ring on It) |  |  | yes | All the single ladies | 48314 |
| 2587 | Clarence Carter | Stroking | Clarence Carter | Strokin' |  |  | yes | Stroking is Strokin' | 49015 |
| 2597 | Destiny's Child | Un-break my heart | Toni Braxton | Un-Break My Heart |  |  | yes | Braxton, not Destiny's Child | 49347 |
| 2648 | Goo Goo Dolls | Bullet proof | Goo Goo Dolls | Bullet Proof |  |  | yes | Studio title | 50241 |
| 2651 | R Kelly | Burning up | R. Kelly | Burn It Up |  |  | yes | Burning→Burn It | 52290 |
| 2660 | Lady Gaga & Wale | Chillin | Wale feat. Lady Gaga | Chillin' |  |  | yes | Wale lead on the recording | 51121 |
| 2668 | Led Zeppelin | D'y'mak'er | Led Zeppelin | D'yer Mak'er |  |  | yes | D'y'mak'er | 51164 |
| 2689 | Sound of Music | Edelweiss | Julie Andrews | Edelweiss | The Sound of Music |  | yes | Sound of Music; restore from | 52852 |
| 2694 | Barbra Streisand & Donna Summer | Enough is enough (no more tears) | Donna Summer & Barbra Streisand | No More Tears (Enough Is Enough) |  |  | yes | classic duet; avoid 2017 remix masters | 48184 |
| 2705 | Journey | Foolish heart | Steve Perry | Foolish Heart |  |  | yes | Perry solo not Journey | 50815 |
| 2709 | Common & John Mayer | Go | Common | Go! |  |  | yes | Common; John Mayer features | 49060 |
| 2735 | Luther Vandross | If I ruled the world | Nas | If I Ruled the World (Imagine That) |  |  | yes | Nas hit; venue wrongly credited Luther | 51363 |
| 2772 | Sound of Music | My favourite things | Julie Andrews | My Favorite Things | The Sound of Music |  | yes | American spelling | 52853 |
| 2799 | Mika | Relax | MIKA | Relax (Take It Easy) |  |  | other | Force MIKA over Austrian Mika namesake | 51686 |
| 2813 | Prince | Sexy motherfucker | Prince | Sexy MF |  |  | yes | Sexy motherfucker | 52229 |
| 2818 | Paul Simon & Art Garfunkel | Since I don't have you | The Skyliners | Since I Don't Have You |  |  | yes | Skyliners 1958 | 52051 |
| 2822 | Sound of Music | So long, farewell | Julie Andrews | So long, farewell | The Sound of Music |  | yes | the children's number, led by Andrews on the soundtrack | 52854 |
| 2855 | Sound of Music | The sound of music | Julie Andrews | The sound of music | The Sound of Music |  | yes | the title number | 52855 |
| 2856 | Roxy Music | The strand | Roxy Music | Do the Strand |  |  | yes | The strand is Do the Strand | 52574 |
| 2893 | Keith Urban | Wouldn't wanna be me | Keith Urban | Who Wouldn’t Wanna Be Me |  |  | yes | Full title | 50946 |
| 2906 | Toby Keith | Does that blue moon ever shine | Toby Keith | Does That Blue Moon Ever Shine on You |  |  | yes | Full title | 53254 |
| 2932 | U2 | Pride in the name of love | U2 | Pride (In the Name of Love) |  |  | other | Full title | 53377 |
| 2934 | Warren G & Nate Dog | Regulate | Warren G & Nate Dogg | Regulate |  |  | yes | Both | 53474 |
| 2974 | Bloodhound Gang | Another dick with no balls | Bloodhound Gang | Right Turn Clyde |  |  | yes | Lyric used as title | 48423 |
| 2989 | Cher | Body to body | Cher | Body to Body, Heart to Heart |  |  | yes | Full title | 48917 |
| 2990 | A-teens | Bouncing off the ceiling | A*Teens | Upside Down |  |  | yes | Bouncing off the ceiling is Upside Down | 47753 |
| 3012 | Bob Dylan | Don't think twice | Bob Dylan | Don’t Think Twice, It’s All Right |  |  | other | Full title beats loose | 48472 |
| 3035 | Eagles | Heat is on | Glenn Frey | The Heat Is On |  |  | yes | Glenn Frey, not the Eagles | 49586 |
| 3048 | Backstreet Boys | I want to be with you | Backstreet Boys | I Wanna Be With You |  |  | yes | Wanna | 48139 |
| 3157 | Chris Brown | Yo (excuse me) | Chris Brown | Yo (Excuse Me Miss) |  |  | other | Full title | 48954 |
| 3192 | Louis Primer (The Jungle book) | I wanna be like you | Louis Prima | I Wan'na Be Like You | The Jungle Book |  | yes | Louis Primer is Louis Prima; Jungle Book | 51342 |
| 3220 | Dreamgirls | One night only | Jennifer Hudson | One Night Only | Dreamgirls |  | yes | Dreamgirls film | 49530 |
| 3259 | The Monkier | Oh my God! | The Moniker | Oh My God! |  |  | yes | Monkier typo | 53156 |
| 3267 | Idolgänget 2010 | All I need is you | Idol Allstars 2010 | All I Need Is You |  |  | yes | Idolgänget 2010 is Idol Allstars 2010 | 50421 |
| 3382 | Lady & The Tramp | Bella Notte (english) | Peggy Lee | Bella Notte | Lady and the Tramp |  | yes | Lady and the Tramp soundtrack | 51090 |
| 3420 | Chess (Linda Eder) | Anthem | Linda Eder | Anthem | Chess |  | yes | Chess | 48931 |
| 3443 | Bette Midler | That's the glory of love | Bette Midler | The Glory of Love |  |  | yes | Drop That’s | 48305 |
| 3446 | Carly Simon | Nobody does it better | Carly Simon | Nobody Does It Better | The Spy Who Loved Me |  | other | James Bond theme | 48771 |
| 3457 | Ozzy Osbourne & Lita Ford | Close my eyes forever | Lita Ford | Close My Eyes Forever |  |  | yes | with Ozzy | 52003 |
| 3484 | Frank Marino | I'm a king be/Back door man medley | Frank Marino | I'm a King Bee |  |  | yes | Drop dump Excerpt From / live medley annotation; title is I'm a King Bee | 50082 |
| 3485 | Genesis | Mirror man | The Human League | Mirror Man |  |  | yes | Not Genesis | 50168 |
| 3493 | Eddie Grant | Electric avenue | Eddy Grant | Electric Avenue |  |  | yes | Venue Eddie Grant matched the wrong MusicBrainz artist (1950s US organist); Electric Avenue is Eddy Grant | 49648 |
| 3504 | Shania Twain | If you're not in it for love | Shania Twain | (If You’re Not in It for Love) I’m Outta Here! |  |  | yes | Full title | 52729 |
| 3524 | Ohio | Fire | Ohio Players | Fire |  |  | yes | Ohio is Ohio Players | 51952 |
| 3527 | Sos | Take your time (do it right) | The S.O.S. Band | Take Your Time (Do It Right) |  |  | yes | Full title | 52850 |
| 3537 | Steve Lawrence & Edie Gorme | This could be the start to something big | Steve & Eydie | This Could Be the Start of Something Big |  |  | yes | Steve Lawrence & Eydie | 52922 |
| 3539 | Tom Jones | Thunderball | Tom Jones | Thunderball | Thunderball |  | other | James Bond theme | 53280 |
| 3551 | Barry White | What am I going to do with you | Barry White | What Am I Gonna Do With You |  |  | yes | Gonna | 48214 |
| 3554 | Barry White & Tina Turner | In your wildest dreams | Tina Turner | In Your Wildest Dreams |  |  | yes | Tina lead with Barry | 48217 |
| 3631 | Rex Smith | Take my breath away | Rex Smith | You Take My Breath Away |  |  | yes | Venue omitted You | 52392 |
| 3634 | Annie | Tomorrow | Andrea McArdle | Tomorrow | Annie |  | yes | Annie; not a tour-cast entity | 48005 |
| 3635 | Annie get your gun | There's no business like show business | Ethel Merman | There's No Business Like Show Business | Annie Get Your Gun |  | yes | Annie Get Your Gun | 48006 |
| 3636 | Annie get your gun | Anything you can do (I can do it better) | Ethel Merman | Anything You Can Do (I Can Do Better) | Annie Get Your Gun |  | yes | Annie Get Your Gun | 48007 |
| 3637 | Bye Bye Birdie | Put on a happy face | Dick Van Dyke | Put On a Happy Face | Bye Bye Birdie |  | yes | Bye Bye Birdie | 48735 |
| 3638 | Caberet | The money song | Liza Minnelli | Money, Money | Cabaret |  | yes | Cabaret | 48737 |
| 3639 | Caberet | Caberet | Liza Minnelli | Cabaret | Cabaret |  | yes | title number; venue spelled Caberet | 48738 |
| 3640 | Fiddler on the roof | If I were a rich man | Topol | If I Were a Rich Man | Fiddler on the Roof |  | yes | Fiddler on the Roof | 49955 |
| 3641 | Gigi | Thank heaven for little girls | Maurice Chevalier | Thank Heaven for Little Girls | Gigi |  | yes | Gigi | 50207 |
| 3642 | Joseph | Any dream will do | Jason Donovan | Any Dream Will Do | Joseph |  | yes | Joseph and the Amazing Technicolor Dreamcoat | 50794 |
| 3643 | Music Man | Till there was you | The Beatles | Till There Was You | The Music Man |  | yes | Music Man number; Beatles popular recording | 51769 |
| 3644 | My Fair Lady | On the street where you live | Vic Damone | On the Street Where You Live | My Fair Lady |  | yes | Damone's hit version | 51772 |
| 3645 | Oliver | Consider yourself | Lionel Bart | Consider Yourself | Oliver! |  | yes | Oliver! soundtrack | 51963 |
| 3646 | Pippen | Corner of the sky | David Essex | Corner of the Sky | Pippin |  | yes | Pippen→Pippin | 52167 |
| 3647 | South Pacific | I'm gonna wash that man right out of my hair | Mitzi Gaynor | I'm Gonna Wash That Man Right Out of My Hair | South Pacific |  | yes | South Pacific | 52857 |
| 3648 | The Fantastics | Try to remember | Jerry Orbach | Try to Remember | The Fantasticks |  | yes | Fantasticks cast | 53138 |
| 3649 | West Side Story | Maria | Larry Kert | Maria | West Side Story |  | yes | Original cast | 53491 |
| 3698 | Reba McEntire | Now you tell me | Reba | Now You Tell Me |  |  | yes | Canonical Reba | 52358 |
| 3764 | Peter Cetera & Amy Grant | Next time I fall in love | Peter Cetera | The Next Time I Fall |  |  | yes | Cetera/Grant hit; prefer Cetera key | 52105 |
| 3779 | Jekyll & Hide | This is the moment | Colm Wilkinson | This Is the Moment | Jekyll & Hyde |  | yes | Jekyll & Hyde the musical (venue Hide typo) | 50622 |
| 3786 | Michael McDonald | Signed, sealed, delivered | Michael McDonald | Signed, Sealed, Delivered I’m Yours |  |  | yes | Full title | 51673 |
| 3796 | Steve Miller | The joker | Steve Miller Band | The Joker |  |  | yes | The Joker is Steve Miller Band, not solo Steve Miller | 52924 |
| 3800 | Samantha Fox | I want to be have some fun | Samantha Fox | I Wanna Have Some Fun |  |  | yes | Correct title | 52611 |
| 3806 | Ricky Martin | Maria (spanish) | Ricky Martin | María |  |  | yes | Spanish title | 52424 |
| 3822 | Rocky horror picture show | Timewarp | Richard O’Brien | Time Warp | The Rocky Horror Picture Show |  | yes | Rocky Horror; from not cast-as-artist | 52515 |
| 3827 | Paul Simon & Art Garfunkel | Times they are a changing | Bob Dylan | The Times They Are A-Changin' |  |  | yes | Dylan, not Simon & Garfunkel | 52052 |
| 3892 | Pink | U and ur hand | P!nk | U + Ur Hand |  |  | yes | U and ur hand | 52144 |
| 3912 | Aventura | Obsecion | Aventura | Obsesión |  |  | yes | Obsecion is Obsesión | 48093 |
| 3920 | Trace Adkins | Every light in the house is on | Trace Adkins | Every Light in the House |  |  | yes | Drop is on | 53345 |
| 3961 | Bob & Bruno Mars | Nothing on you | B.o.B & Bruno Mars | Nothin' on You |  |  | yes | Bob is B.o.B | 48461 |
| 3984 | Swedish House Mafia & John Martin | Save the world | Swedish House Mafia | Save the World |  |  | yes | feat John Martin | 53021 |
| 3992 | Taylor Swift | If this were a movie | Taylor Swift | If This Was a Movie |  |  | yes | Was not Were | 53063 |
| 4015 | Prefab Sprout | King of rock and roll | Prefab Sprout | The King of Rock ’n’ Roll |  |  | yes | Full title | 52210 |
| 4041 | Amy McDonald | This is the life | Amy Macdonald | This Is the Life |  |  | yes | McDonald is Macdonald | 47957 |
| 4058 | Weezer | If you're wondering if I want you to | Weezer | (If You’re Wondering If I Want You To) I Want You To |  |  | yes | Full title | 53488 |
| 4068 | Bruno Mars & Travie McCoy | Billionaire | Travie McCoy feat. Bruno Mars | Billionaire |  |  | yes | Correct lead | 48701 |
| 4092 | Rammstein | Du hast (english) | Rammstein | Du hast (English version) |  |  | other | English version of Du hast | 52329 |
| 4095 | Bruno Mars | Just the way you are (Amazing) | Bruno Mars | Just the Way You Are |  |  | other | Drop Amazing mashup | 48697 |
| 4096 | 2 Pac feat. KC & Jo Jo | How do u want it | 2Pac feat. K-Ci & JoJo | How Do U Want It |  |  | yes | the venue wrote 2 Pac feat. KC & Jo Jo; K-Ci & JoJo is one duo | 47722 |
| 4100 | Little Mermaid | Part of your world (Disney) | Jodi Benson | Part of Your World | The Little Mermaid |  | yes | Ariel's singing voice | 51298 |
| 4107 | Dreamgirls | Move | Beyoncé | Move Your Body | Dreamgirls |  | other | Dreamgirls; may not match | 49531 |
| 4155 | Wolfman & Pete Doherty | For lovers | Wolfman | For Lovers |  |  | yes | feat Pete Doherty | 53579 |
| 4168 | Fort Minor & Holly Brook | Where'd you go | Fort Minor | Where’d You Go |  |  | yes | Holly Brook feature | 50071 |
| 4173 | Chris Daughtry | Over you | Daughtry | Over you |  |  | yes | the band is Daughtry | 48959 |
| 4177 | Kardinall Offishall | Dangerous | Kardinal Offishall feat. Akon | Dangerous |  |  | yes | Kardinall typo | 50912 |
| 4199 | Chris Brown & Justin Bieber | Next 2 you | Chris Brown feat. Justin Bieber | Next to You |  |  | yes | Next 2 you; dump uses feat. | 48955 |
| 4231 | Gladys Knight & The Pips | Licence to kill | Gladys Knight & the Pips | Licence to Kill | Licence to Kill |  | other | James Bond theme | 50218 |
| 4280 | Justin Bieber & Rascal Flatts | That should be me | Justin Bieber feat. Rascal Flatts | That Should Be Me |  |  | yes | Both | 50874 |
| 4292 | Juanes & Colbie Caillat | Hoy me voy | Juanes | Hoy me voy |  |  | yes | with Colbie | 50833 |
| 4303 | Shirley Bassey | Goldfinger | Shirley Bassey | Goldfinger | Goldfinger |  | other | James Bond theme | 52769 |
| 4314 | Lena PH | Vem kan man lita på | Lena Philipsson | Vem kan man lita på |  |  | yes | abbreviation of Lena Philipsson | 51184 |
| 4316 | Amanda Fondell | Made it all this way | Amanda Fondell | All This Way |  |  | yes | Correct title | 47944 |
| 4317 | Moa Lignell | All I need is you (When I held ya) | Moa Lignell | When I Held Ya |  |  | yes | Parenthetical was the title | 51720 |
| 4383 | Beyonce & Justin Timberlake | Until the end of time | Justin Timberlake & Beyoncé | Until the End of Time |  |  | yes | Timberlake lead on the recording | 48324 |
| 4407 | Britney Spears | Slave for you | Britney Spears | I'm a Slave 4 U |  |  | yes | Slave for you | 48637 |
| 4420 | Britney Spears | Do something | Britney Spears | Do Somethin’ |  |  | yes | Canonical beats remix loose | 48650 |
| 4461 | Justin Timberlake & Ciara | Love sex magic | Ciara feat. Justin Timberlake | Love Sex Magic |  |  | yes | Correct lead | 50893 |
| 4553 | Depeche Mode | Blasphemous | Depeche Mode | Blasphemous Rumours |  |  | yes | Full title | 49323 |
| 4600 | Dr Dre, Snoop Doggy Dog | Nuthin' but a 'G' thang | Dr. Dre feat. Snoop Doggy Dogg | Nuthin’ but a “G” Thang |  |  | yes | Both | 49516 |
| 4607 | Eagles | Lying eyes | Eagles | Lyin' Eyes |  |  | other | venue Lying eyes; studio title is Lyin' Eyes | 49600 |
| 4626 | Erik Amarillo | Om sanningen ska fram | Eric Amarillo | Om sanningen ska fram (Vill du ligga med mig?) |  |  | yes | Erik→Eric; full title | 49856 |
| 4662 | Foo Fighters | I'll be coming home next year | Foo Fighters | Next Year |  |  | yes | Lyric as title | 50065 |
| 4725 | Iron Maiden | Iron fist | Motörhead | Iron Fist |  |  | yes | Iron Fist is Motörhead, not Iron Maiden | 50476 |
| 4747 | Jay Z feat Pharrell | I know | JAY-Z | I Know |  |  | yes | feat Pharrell | 50610 |
| 4750 | John Legend | Hey girl | Estelle feat. John Legend | You Are |  |  | yes | Hey girl was lyric | 50733 |
| 4866 | Moulin Rouge | Elephant love medley | Nicole Kidman & Ewan McGregor | Elephant love medley | Moulin Rouge! |  | yes | the duet | 51751 |
| 4904 | Pras Michel, Obd & Mya | Ghetto superstar (duet) | Pras Michel featuring Ol’ Dirty Bastard and introducing Mýa | Ghetto Supastar (That Is What You Are) |  |  | yes | Full credit | 52209 |
| 4967 | Smash Mouth | You are my number one | Smash Mouth | You Are My Number One |  |  | other | Studio cut | 52817 |
| 4968 | Snoop Dog & Justin Timberlake | Signs | Snoop Dogg feat. Justin Timberlake | Signs |  |  | yes | Both | 52826 |
| 4969 | Snoop Dog & Pharrell | Drop it like it's hot | Snoop Dogg feat. Pharrell | Drop It Like It’s Hot |  |  | yes | Both | 52827 |
| 4978 | Steely Dan | Fm (no static at all) | Steely Dan | FM (No Static at All) |  |  | other | Full title | 52904 |
| 4981 | Steely Dan | My school | Steely Dan | My Old School |  |  | yes | My school is My Old School | 52907 |
| 5029 | The Isley Brothers | Fight the power | The Isley Brothers | Fight the Power, Parts 1 & 2 |  |  | other | Full title | 53147 |
| 5047 | Tooji (Eurovision 2012 Norway) | Stay | Tooji | Stay | Eurovision |  | other | Eurovision as category; not Eurovision 2012 Norway | 53329 |
| 5055 | Aerosmith And Run Dmc | Walk This Way | Run‐D.M.C. feat. Aerosmith | Walk This Way |  |  | yes | Full 1986 credit | 47839 |
| 5121 | Enya (fellowship Of The Ring Soundtrack) | May It Be | Enya | May It Be | The Fellowship of the Ring |  | other | soundtrack note belongs in from, not the artist name | 49834 |
| 5134 | Frozen | Let It Go | Idina Menzel | Let It Go | Frozen |  | yes | Frozen | 50125 |
| 5135 | Frozen | Do You Want To Build A Snowman | Kristen Bell, Agatha Lee Monn & Katie Lopez | Do You Want to Build a Snowman? | Frozen |  | yes | Frozen | 50126 |
| 5165 | Jesus Christ Superstar | Superstar | Murray Head | Superstar | Jesus Christ Superstar |  | yes | Judas on the 1970 album | 50662 |
| 5194 | Lighthouse Family, The | High | Lighthouse Family | High |  |  | yes | Drop inverted The | 51236 |
| 5205 | Macklemore & Ryan Lewis Feat. Schoolboy Q And Holl | White Walls | Macklemore & Ryan Lewis | White Walls |  |  | other | feat Schoolboy Q | 51385 |
| 5223 | New Kids On Block | Step By Step | New Kids on the Block | Step by Step |  |  | yes | New Kids On Block | 51847 |
| 5247 | Phantom Of The Opera | Music Of The Night | Michael Crawford | The Music of the Night | The Phantom of the Opera |  | yes | Phantom of the Opera | 52120 |
| 5264 | Rihanna Feat Kanye West And Paul Mccartney | Four Five Seconds | Kanye West feat. Rihanna & Paul McCartney | FourFiveSeconds |  |  | yes | studio OneWord title; dump files Kanye first on the non-remix master | 52454 |
| 5275 | Sheena Easton | For Your Eyes Only | Sheena Easton | For Your Eyes Only | For Your Eyes Only |  | other | James Bond theme | 52760 |
| 5317 | Whitney Houston | Nobody Loves Me Like You | Whitney Houston duet with Jermaine Jackson | Nobody Loves Me Like You Do |  |  | yes | Full duet credit | 53553 |
| 5330 | Atc | All Around The World ( La La La) | ATC | Around the World (La La La La La) |  |  | yes | Atc casing; title | 48070 |
| 5335 | Avicii Ft. Robbie Williams | The Days | Avicii feat. Robbie Williams | The Days |  |  | yes | Both credits | 48101 |
| 5346 | Disney | I Just Can't Wait To Be King | Jason Weaver | I Just Can't Wait to Be King | The Lion King |  | yes | Lion King | 49410 |
| 5347 | Disney | I Wanna Be Like You | Louis Prima | I Wan'na Be Like You | The Jungle Book |  | yes | Jungle Book | 49411 |
| 5348 | Disney | I'll Make A Man Out Of You | Donny Osmond | I'll Make A Man Out Of You | Mulan |  | yes | Osmond is Shang's singing voice in Mulan | 49412 |
| 5349 | Disney | The Bare Necessities | Phil Harris | The Bare Necessities | The Jungle Book |  | yes | Jungle Book | 49413 |
| 5350 | Disney | Under The Sea | Samuel E. Wright | Under the Sea | The Little Mermaid |  | yes | Little Mermaid | 49414 |
| 5372 | Fall Out Boy | My Songs Know What You Did | Fall Out Boy | My Songs Know What You Did in the Dark (Light Em Up) |  |  | yes | Full title | 49941 |
| 5378 | Imany Ft. Filatov & Karas | Don't Be So Shy | Imany | Don’t Be So Shy |  |  | yes | Filatov & Karas remix | 50432 |
| 5408 | Marina and The Diamonds | Robot | Marina and the Diamonds | I Am Not a Robot |  |  | yes | Robot is I Am Not a Robot | 51512 |
| 5422 | Rembrandts, The | I'll Be There For You | The Rembrandts | I’ll Be There for You |  |  | yes | Article | 52385 |
| 5425 | Rihanna & Kanye West & Paul Mccartney | Fourfiveseconds | Kanye West feat. Rihanna & Paul McCartney | FourFiveSeconds |  |  | yes | same song; prefer studio FourFiveSeconds over DJ Mustard remix | 52452 |
| 5439 | Strokes, The | Someday | The Strokes | Someday |  |  | yes | Strokes, The | 52960 |
| 5442 | Swedish House Mafia And Pharrell | One | Swedish House Mafia | One |  |  | yes | feat Pharrell | 53023 |
| 5455 | Who, The | Baba O'riley | The Who | Baba O'Riley |  |  | yes | Who, The; O'riley casing | 53559 |
| 5485 | Eamon | Fuck it, i dont want yo back | Eamon | Fuck It (I Don't Want You Back) |  |  | yes | title | 49601 |
| 5486 | Disney | Be our guest | Angela Lansbury & Jerry Orbach | Be Our Guest | Beauty and the Beast |  | yes | Beauty and the Beast | 49415 |
| 5487 | Disney | A dream is a wish | Ilene Woods | A Dream Is a Wish Your Heart Makes | Cinderella |  | yes | Cinderella | 49416 |
| 5488 | Disney | Bibbidi bobidi boo | Verna Felton | Bibbidi-Bobbidi-Boo | Cinderella |  | yes | Cinderella fairy godmother | 49417 |
| 5489 | Disney | Supercalifragilist | Julie Andrews | Supercalifragilisticexpialidocious | Mary Poppins |  | yes | Mary Poppins; venue truncated Supercalifragilist | 49418 |
| 5490 | Disney | Never smile at a crocodile | Joe York | Never Smile at a Crocodile | Peter Pan |  | yes | Peter Pan / Disney karaoke vocal; avoid [Disney] placeholder | 49419 |
| 5491 | Disney | Listen with you heart | Linda Hunt & Bobbi Page | Listen With Your Heart | Pocahontas |  | yes | Pocahontas; Linda Hunt & Bobbi Page soundtrack | 49420 |
| 5492 | Disney | I just can't wait to be king | Jason Weaver | I Just Can't Wait to Be King | The Lion King |  | yes | duplicate Lion King row | 49421 |
| 5493 | Disney | A spoon full of sugar | Julie Andrews | A Spoonful of Sugar | Mary Poppins |  | yes | Mary Poppins; spoonful is one word | 49422 |
| 5495 | Hall & Oates | You make my dreams | Daryl Hall & John Oates | You Make My Dreams |  |  | yes | studio Voices cut; avoid live Park West master | 50329 |
| 5501 | Kygo ft. Selena Gomez | It aint me | Kygo & Whitney Houston | Higher Love |  |  | yes | Kygo's cover with Houston | 51079 |
| 5530 | Mike WMI ft Miley Cyrus | 23 | Mike WiLL Made-It feat. Miley Cyrus, Wiz Khalifa & Juicy J | 23 |  |  | yes | Mike WMI is Mike WiLL Made-It; 23 is the full featured credit | 51698 |
| 5531 | Rudimental Ft James Arthur | Sun comes up | Rudimental feat. James Arthur | Sun Comes Up |  |  | yes | Both | 52583 |
| 5542 | Chris Stapleton | Tennessee Whickey | Chris Stapleton | Tennessee Whiskey |  |  | yes | Whickey is Whiskey | 48987 |
| 5552 | Hamilton | Alexander Hamilton | Lin-Manuel Miranda | Alexander Hamilton | Hamilton |  | yes | opening number; cast credit not in dump | 50330 |
| 5558 | Ed Sheeran Ft. Eminem | River | Eminem feat. Ed Sheeran | River |  |  | yes | backup; dump bills Eminem first | 49643 |
| 5566 | The police | De do do de | The Police | De Do Do Do, De Da Da Da |  |  | yes | venue truncated the title | 53159 |
| 5577 | Creed | Stand with me | Creed | Stand Here With Me |  |  | yes | Venue omitted Here | 49140 |
| 5605 | Shawn Mendes | Nothing holding me back | Shawn Mendes | There’s Nothing Holdin’ Me Back |  |  | yes | Full title | 52751 |
| 5606 | Shawn Mendes | I know what you did | Shawn Mendes | I Know What You Did Last Summer |  |  | yes | Full title | 52752 |
| 5609 | Justin Bieber ft Ed sheeran | I don't care | Ed Sheeran & Justin Bieber | I Don't Care |  |  | yes | backup if collab-scoped misses; dump bills Sheeran first | 50879 |
| 5610 | Nas Ft Billy Ray Cyrus | Old town road | Lil Nas X feat. Billy Ray Cyrus | Old Town Road |  |  | yes | venue credited Nas; Lil Nas X | 51793 |
| 5628 | Ariana Grande  & Victoria Monet | Monolpoly | Ariana Grande & Victoria Monét | Monopoly |  |  | yes | Monolpoly is Monopoly | 48058 |
| 5629 | Ariana  Grand ft Mac Miller | The Way | Ariana Grande feat. Mac Miller | The Way |  |  | yes | Grand is Grande | 48045 |
| 5652 | J Balvin ft. Cardi B | I like it | Cardi B, Bad Bunny & J Balvin | I Like It |  |  | yes | Cardi B lead; venue had J Balvin ft Cardi B | 50509 |
| 5669 | Drömhus | Fantasi | Freestyle | Fantasi |  |  | yes | Freestyle not Drömhus | 49537 |
| 5670 | Uffe Neidemar | Häng med på party | Ulf Neidemar | Häng med på party |  |  | yes | Uffe is Ulf; duplicate listing | 53388 |
| 5678 | Ulf Lundell | Oh  lalala jag vill ha dig | Ulf Lundell | (Oh la la) Jag vill ha dej |  |  | yes | Oh lalala jag vill ha dig | 53394 |
| 5688 | Drängarna | Om du vill bli min fru | Drängarna | Vill du bli min fru |  |  | yes | venue added Om | 49535 |
| 5691 | The cartoons | Doo dah | Cartoons | DooDah |  |  | yes | Danish Cartoons; title is DooDah | 53119 |
| 5696 | Freddie Bell | The Bell boys | Freddie Bell & the Bellboys | Giddy Up a Ding Dong |  |  | yes | Venue put group in title field | 50113 |
| 5698 | Grease Mega Mix | Grease MIX | John Travolta & Olivia Newton‐John | The Grease Megamix | Grease |  | yes | Grease Mega Mix is category | 50272 |
| 5700 | Marvin Gaye | Nothing like the real thing | Marvin Gaye & Tammi Terrell | Ain’t Nothing Like the Real Thing |  |  | yes | Duet | 51552 |
| 5726 | Bruno Mars ft Cardi B | Finesse | Bruno Mars | Finesse |  |  | yes | Cardi remix; prefer Bruno Mars Finesse | 48702 |
| 5728 | BTS | Blood sweat and tears | BTS | Blood Sweat & Tears |  |  | other | BTS hit | 48716 |
| 5732 | Fall out boy | I'm like a lawyer | Fall Out Boy | I’m Like a Lawyer With the Way I’m Always Trying to Get You Off (Me + You) |  |  | other | Full title | 49943 |
| 5737 | Fleetwod mac | Sara | Fleetwood Mac | Sara |  |  | yes | Fleetwod is Fleetwood | 50010 |
| 5745 | High school musical | Breaking free | Zac Efron & Vanessa Hudgens | Breaking Free | High School Musical |  | yes | HSM cast | 50367 |
| 5746 | High school musical | What time is | The High School Musical Cast | What Time Is It? | High School Musical 2 |  | yes | HSM2 | 50368 |
| 5747 | High school musical | What iv'e been looking for | Ashley Tisdale & Lucas Grabeel | What I've Been Looking For | High School Musical |  | yes | venue typo What iv'e; HSM | 50369 |
| 5757 | Fall out boy | A little less sixteen candles | Fall Out Boy | A Little Less Sixteen Candles, a Little More “Touch Me” |  |  | yes | Full title | 49945 |
| 5760 | Aloe Blacc | I need a doollar | Aloe Blacc | I Need a Dollar |  |  | yes | doollar is Dollar with an extra o | 47938 |
| 5778 | Frozen II | All is found | Evan Rachel Wood | All is found | Frozen II |  | yes | Queen Iduna's lullaby | 50127 |
| 5786 | Frozen II | When im older | Josh Gad | When I Am Older | Frozen II |  | yes | Olaf's number | 50128 |
| 5790 | Frozen II | The next right thing | Kristen Bell | The next right thing | Frozen II |  | yes | Anna's number | 50129 |
| 5797 | Posion | I want action | Poison | I want action |  |  | yes | Posion is Poison with two letters swapped | 52199 |
| 5798 | Posion | Unskinny bop | Poison | Unskinny bop |  |  | yes | Posion is Poison; Unskinny Bop is theirs | 52200 |
| 5799 | Posion | Yoour mama don't dance | Poison | Your Mama Don't Dance |  |  | yes | Poison covered it in 1989 | 52201 |
| 5810 | Lil Naz X | Call me by your name | Lil Nas X | Montero (Call Me by Your Name) |  |  | yes | Call me by your name | 51238 |
| 5813 | Chief keef ft 50 cent | Hate bein sober | Chief Keef | Hate Bein’ Sober |  |  | yes | Lead match OK; keep Chief Keef | 48941 |
| 5816 | Lil Uzi Vert | XO tour | Lil Uzi Vert | XO Tour Llif3 |  |  | yes | Canonical | 51239 |
| 5823 | Donna Fargo | Happiest girl in the while U.S | Donna Fargo | The Happiest Girl in the Whole U.S.A. |  |  | yes | Full title | 49483 |
| 5824 | David Crosby ft Phil Collins | Hero | David Crosby | Hero |  |  | yes | With Phil Collins | 49251 |
| 5839 | Thomas Jack ft Nico | Rivers | Thomas Jack | Rivers |  |  | yes | feat Nico & Vinz | 53207 |
| 5843 | High school musical | Were all in this together | High School Musical Cast | We’re All in This Together | High School Musical |  | yes | Cast not [Disney] | 50370 |
| 5873 | Joel Corry ft MNEK | Head and heart | Joel Corry feat. MNEK | Head & Heart |  |  | yes | Head and heart; dump uses & which folds differently from and | 50715 |
| 5900 | Ryan Gosling | I'm just Ken | Ryan Gosling | I'm Just Ken | Barbie |  | other | from Barbie (2023) | 52589 |
| 5901 | Andrea Bocelli ft Sara Brightman | Time to say goodbye | Andrea Bocelli & Sarah Brightman | Time to Say Goodbye |  |  | yes | Sara is Sarah | 47972 |
