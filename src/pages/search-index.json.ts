import type { APIRoute } from "astro";
import { buildSearchIndex } from "../lib/catalogue";
import { getArtists, getSongs } from "../lib/songs";

export const prerender = true;

export const GET: APIRoute = () => {
    const body = {
        songs: buildSearchIndex(getSongs()),
        artists: getArtists().map((a) => ({ name: a.name, slug: a.slug })),
    };
    return new Response(JSON.stringify(body), {
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
        },
    });
};
