import type { StoreApi, UseBoundStore } from "zustand";

type WithSelectors<TStore> = TStore extends { getState: () => infer TState extends object }
  ? TStore & { use: { [TKey in keyof TState]: () => TState[TKey] } }
  : never;

export const createSelectors = <TStore extends UseBoundStore<StoreApi<object>>>(
  baseStore: TStore,
) => {
  const store = baseStore as WithSelectors<TStore>;
  store.use = {} as WithSelectors<TStore>["use"];

  for (const key of Object.keys(store.getState()) as Array<
    keyof ReturnType<typeof store.getState>
  >) {
    (store.use as Record<string, () => unknown>)[key as string] = () =>
      store((state) => state[key as keyof typeof state]);
  }

  return store;
};
