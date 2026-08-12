"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "kkaraoke:favorites";

function readFavorites(): number[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === "number") : [];
    } catch {
        return [];
    }
}

function writeFavorites(ids: number[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event("kkaraoke:favorites"));
}

let cached = typeof window === "undefined" ? ([] as number[]) : readFavorites();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY || e.key === null) {
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

    function toggle(id: number) {
        const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
        cached = next;
        writeFavorites(next);
        listeners.forEach((l) => l());
    }

    return { favorites, toggle, ready, isFavorite: (id: number) => favorites.includes(id) };
}

interface FavoriteButtonProps {
    songId: number;
}

export default function FavoriteButton({ songId }: FavoriteButtonProps) {
    const { isFavorite, toggle, ready } = useFavorites();
    const on = ready && isFavorite(songId);

    return (
        <button
            type="button"
            aria-label={on ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={on}
            onClick={() => toggle(songId)}
            className="min-w-11 bg-transparent px-1 py-2.5 text-[17px]"
            style={{ border: 0, color: on ? "#E9B44C" : "#3B3733" }}
        >
            ♥
        </button>
    );
}
