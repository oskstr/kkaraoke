import FavoriteButton from "./FavoriteButton";
import type { SearchSong } from "../lib/catalog";

function ArtistLinks({
    song,
    onArtistClick,
}: {
    song: SearchSong;
    onArtistClick?: ((e: React.MouseEvent) => void) | undefined;
}) {
    if (song.artists && song.artists.length > 0) {
        return (
            <>
                {song.artists.map((artist, index) => (
                    <span key={artist.slug}>
                        {index > 0 && ", "}
                        <a
                            href={`/artists/${artist.slug}`}
                            className="song-artist-link"
                            data-vt-artist={artist.slug}
                            onClick={onArtistClick}
                        >
                            {artist.name}
                        </a>
                    </span>
                ))}
            </>
        );
    }
    return <>{(song.categories ?? []).join(", ")}</>;
}

function SongSubtitle({ song }: { song: SearchSong }) {
    const meta = [song.from, song.year ? String(song.year) : null].filter(Boolean);
    return (
        <>
            <ArtistLinks song={song} />
            {meta.length > 0 && (
                <span>
                    {(song.artists && song.artists.length > 0) || (song.categories ?? []).length ? " · " : ""}
                    {meta.join(" · ")}
                </span>
            )}
        </>
    );
}

function SongNumbers({ ids }: { ids: number[] }) {
    const label = ids.length === 1 ? `Number ${ids[0]}` : `Numbers ${ids.join(", ")}`;
    return (
        <span
            className="song-num flex w-11 shrink-0 flex-col items-end gap-0.5 self-start pt-1 font-mono text-[12px] leading-none text-gold tabular-nums"
            aria-label={label}
        >
            {ids.map((id) => (
                <span key={id} aria-hidden="true">
                    {id}
                </span>
            ))}
        </span>
    );
}

export function SongTableHead() {
    return (
        <div className="song-table-head" aria-hidden="true">
            <span className="song-num">#</span>
            <span>Title</span>
            <span>Artist</span>
            <span>From</span>
            <span className="song-col-year">Year</span>
            <span></span>
        </div>
    );
}

interface SongResultRowProps {
    song: SearchSong;
    stopArtistNav?: boolean;
}

export default function SongResultRow({ song, stopArtistNav = false }: SongResultRowProps) {
    const onArtistClick = stopArtistNav ? (e: React.MouseEvent) => e.stopPropagation() : undefined;

    return (
        <div className="song-row flex items-start gap-2.5 border-b border-line py-3">
            <SongNumbers ids={song.ids} />
            <div className="song-body flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
                <div className="song-title text-[15.5px] leading-snug text-cream">{song.title}</div>
                <div className="song-sub mt-0.5 text-[13px] text-muted">
                    <SongSubtitle song={song} />
                </div>
            </div>
            <div className="song-col song-col-artist">
                <ArtistLinks song={song} onArtistClick={onArtistClick} />
            </div>
            <div className="song-col">{song.from ?? ""}</div>
            <div className="song-col song-col-year">{song.year ? String(song.year) : ""}</div>
            <FavoriteButton songIds={song.ids} />
        </div>
    );
}
