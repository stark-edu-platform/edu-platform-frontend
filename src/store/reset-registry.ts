type Resetter = () => void;

const resetters = new Set<Resetter>();

/**
 * Register a function that wipes one feature store (or the query cache) back to
 * its empty state. Each resettable calls this once at module init, so logout
 * doesn't need to import every store (which would create import cycles).
 */
export const registerResettable = (fn: Resetter): void => {
  resetters.add(fn);
};

/**
 * Wipe every registered store + cache. Invoked on logout and on an unrecoverable
 * 401, so the next user on the same tab can never see the previous user's data.
 */
export const resetAllClientState = (): void => {
  resetters.forEach((reset) => reset());
};
