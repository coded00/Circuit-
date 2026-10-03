"use client";

/**
 * Circuit — hands every GameArtTile the admin-uploaded image for its game.
 * Tournament.game / Battle.game are plain names, so the root layout loads
 * one small name → image map from the Game catalog (gameImageMap) and
 * shares it here, rather than each of the ~20 tile call sites querying
 * the catalog on its own.
 */

import { createContext, useContext } from "react";
import type { GameImages } from "@/lib/gameCatalogQueries";

const GameImageContext = createContext<GameImages>({ cover: {}, icon: {} });

export function GameImageProvider({ images, children }: { images: GameImages; children: React.ReactNode }) {
  return <GameImageContext.Provider value={images}>{children}</GameImageContext.Provider>;
}

/** `prefer: "icon"` for small thumbnails, "cover" (the default) for anything wide. */
export function useGameImage(game: string, prefer: "cover" | "icon" = "cover"): string | null {
  return useContext(GameImageContext)[prefer][game.trim().toLowerCase()] ?? null;
}
