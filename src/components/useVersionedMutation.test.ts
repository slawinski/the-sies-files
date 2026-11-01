import { expect, it, vi } from "vitest";
import { executeCommand } from "@/lib/command-refresh";
import { ApiClientError } from "@/lib/client-api";

it("preserves an acknowledged result when refresh fails without replaying the command", async () => {
  const command = vi.fn().mockResolvedValue({ version: 12, token: "one-time-result" });
  const refresh = vi.fn().mockRejectedValue(new Error("refresh unavailable"));
  const result = await executeCommand(command, refresh, () => {});
  expect(result.committed).toBe(true);
  expect(result.value).toEqual({ version: 12, token: "one-time-result" });
  expect(result.refreshError).toBeInstanceOf(Error);
  expect(result.commandError).toBeNull();
  expect(command).toHaveBeenCalledTimes(1);
});

it("preserves VERSION_CONFLICT while consuming a rejected conflict refresh", async () => {
  const error = new ApiClientError(409, "VERSION_CONFLICT", "conflict");
  const command = vi.fn().mockRejectedValue(error);
  const result = await executeCommand(command, () => Promise.reject(new Error("refresh failed")), () => {});
  expect(result.committed).toBe(false);
  expect(result.commandError).toBe(error);
  expect(result.refreshError).toBeInstanceOf(Error);
  expect(command).toHaveBeenCalledTimes(1);
});
