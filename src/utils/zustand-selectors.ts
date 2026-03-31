import type { StoreApi, UseBoundStore } from "zustand";

type SelectorHooks<TState extends object> = {
  [TKey in keyof TState]: () => TState[TKey];
};

type WithSelectors<TStore extends UseBoundStore<StoreApi<object>>> =
  TStore extends UseBoundStore<StoreApi<infer TState extends object>>
    ? TStore & { use: SelectorHooks<TState> }
    : never;

export const createSelectors = <TStore extends UseBoundStore<StoreApi<object>>>(
  baseStore: TStore,
) => {
  const store = baseStore as WithSelectors<TStore>;
  const useSelectors = {} as WithSelectors<TStore>["use"];
  const stateKeys = Object.keys(store.getState()) as Array<keyof typeof useSelectors>;

  for (const key of stateKeys) {
    useSelectors[key] = () => store((state) => state[key]);
  }

  store.use = useSelectors;
  return store;
};
