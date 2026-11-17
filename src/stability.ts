/** Stability types for the value list, with the colours used for their names. */
export interface StabilityType {
  id: string;
  label: string;
  color: string;
}

export const STABILITIES: StabilityType[] = [
  { id: "rising", label: "Rising", color: "#4caf50" },
  { id: "overpaid", label: "Overpaid for", color: "#6b7cff" },
  { id: "doing_well", label: "Doing well", color: "#5b8cff" },
  { id: "improving", label: "Improving", color: "#f5a623" },
  { id: "fluctuating", label: "Fluctuating", color: "#a020f0" },
  { id: "receding", label: "Receding", color: "#ffe14a" },
  { id: "stable", label: "Stable", color: "#a0a0a0" },
  { id: "underpaid", label: "Underpaid for", color: "#c8742b" },
  { id: "decreasing", label: "Decreasing", color: "#e8431f" },
  { id: "unsafe", label: "Unsafe", color: "#ff1f1f" },
];

export const stabilityOf = (id: string | null | undefined) => STABILITIES.find((s) => s.id === id) ?? null;
