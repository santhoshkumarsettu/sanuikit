"use client";

import { useQuery } from "@tanstack/react-query";
import type { Permission } from "@vstudio/auth";
import { ApiError, vstudioApi } from "@vstudio/api-client";

export function usePermissions() {
  const accountQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => vstudioApi.me(),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status < 500) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 3_000),
    staleTime: 15_000,
  });
  const permissions = new Set(accountQuery.data?.permissions ?? []);

  return {
    accountQuery,
    can: (permission: Permission) => permissions.has(permission),
  };
}
