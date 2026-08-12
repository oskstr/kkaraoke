"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isFavoriteAny, readFavorites, toggleFavoriteIds } from "../scripts/favorites";

let cached = typeof window === "undefined" ? ([] as number[]) : readFavorites();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key === "kkaraoke:favorites" || e.key === null) {
            cached = readFavorites();
            listeners.forEach((l) => l());
        }
    };
    const onCustom = () => {
        cached = readFavorites();
        listeners.forEach((l) => l());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("kkaraoke:favorites", onCustom);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("kkaraoke:favorites", onCustom);
    };
}

function getSnapshot() {
    return cached;
}

function getServerSnapshot() {
    return [] as number[];
}

export function useFavorites() {
    const favorites = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        cached = readFavorites();
        listeners.forEach((l) => l());
        setReady(true);
    }, []);

    function toggle(ids: number | number[]) {
        const list = Array.isArray(ids) ? ids : [ids];
        const next = toggleFavoriteIds(list);
        cached = next;
        listeners.forEach((l) => l());
    }

    return {
        favorites,
        toggle,
        ready,
        isFavorite: (ids: number | number[]) =>
            isFavoriteAny(Array.isArray(ids) ? ids : [ids], favorites),
    };
}

interface FavoriteButtonProps {
    songId?: number;
    songIds?: number[];
}

export default function FavoriteButton({ songId, songIds }: FavoriteButtonProps) {
    const ids = songIds ?? (songId !== undefined ? [songId] : []);
    const { isFavorite, toggle, ready } = useFavorites();
    const on = ready && isFavorite(ids);

    return (
        <button
            type="button"
            aria-label={on ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={on}
            onClick={() => toggle(ids)}
            className="min-w-11 self-center bg-transparent px-1 py-2.5 text-[17px]"
            style={{ border: 0, color: on ? "#E9B44C" : "#3B3733" }}
        >
            ♥
        </button>
    );
}
