import { create } from "zustand";
import type { Category } from "../domain/models";
interface Draft {
  title: string;
  description: string;
  category: Category;
  budget: string;
  address: string;
  timing: "now" | "today" | "scheduled";
  scheduled: string;
  duration: string;
}
const initial: Draft = {
  title: "",
  description: "",
  category: "General repair",
  budget: "",
  address: "",
  timing: "today",
  scheduled: "",
  duration: "60",
};
export const useRequestDraft = create<
  Draft & { edit: (patch: Partial<Draft>) => void; reset: () => void }
>((set) => ({
  ...initial,
  edit: (patch) => set(patch),
  reset: () => set(initial),
}));
