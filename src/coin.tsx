import { createContext, useContext } from "react";

/** The coin icon for the active theme (🪙 normal, ❄️ Christmas, 🍬 Halloween). */
export const CoinContext = createContext("🪙");
export const useCoin = () => useContext(CoinContext);
