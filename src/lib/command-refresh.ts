import { ApiClientError } from "./client-api";

/** A failed projection read cannot undo a server acknowledgement. */
export async function executeCommand<T>(
  command: () => Promise<T>,
  refresh: () => Promise<unknown>,
  acknowledge: (value: T) => void,
) {
  let value: T | null = null;
  let commandError: unknown = null;
  let refreshError: unknown = null;
  let committed = false;
  try {
    value = await command();
    committed = true;
  } catch (error) {
    commandError = error;
  }

  if (committed) acknowledge(value as T);

  if (committed || (commandError instanceof ApiClientError && commandError.code === "VERSION_CONFLICT")) {
    try {
      await refresh();
    } catch (error) {
      refreshError = error;
    }
  }

  return { committed, value, commandError, refreshError };
}
