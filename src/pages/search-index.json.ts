import type { APIRoute } from "astro";
import { buildSearchArtists, buildSearchIndex } from "../lib/catalog";
import { getSongs } from "../lib/songs";

export const prerender = true;

export const GET: APIRoute = () => {
    const body = {
        songs: buildSearchIndex(getSongs()),
        artists: buildSearchArtists(),
    };
    return new Response(JSON.stringify(body), {
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
        },
    });
};
