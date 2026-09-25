"use client";

/**
 * Circuit — hands every GameArtTile the admin-uploaded image for its game.
 * Tournament.game / Battle.game are plain names, so the root layout loads
 * one small name → image map from the Game catalog (gameImageMap) and
 * shares it here, rather than each of the ~20 tile call sites querying
 * the catalog on its own.
 */

import { createContext, useContext } from "react";

const GameImageContext = createContext<Record<string, string>>({});

export function GameImageProvider({ images, children }: { images: Record<string, string>; children: React.ReactNode }) {
  return <GameImageContext.Provider value={images}>{children}</GameImageContext.Provider>;
}

export function useGameImage(game: string): string | null {
  return useContext(GameImageContext)[game.trim().toLowerCase()] ?? null;
}
