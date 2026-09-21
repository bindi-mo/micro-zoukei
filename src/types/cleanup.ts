export type Cleanup = () => void;

export const NOOP_CLEANUP: Cleanup = () => undefined;
