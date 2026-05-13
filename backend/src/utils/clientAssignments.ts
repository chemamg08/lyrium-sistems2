const collectStringIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringIds(item));
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.flatMap((item) => collectStringIds(item));
      }
    } catch {
      // Fall back to treating it as a plain string.
    }
  }

  return [trimmed];
};

export const normalizeAssignedSubaccountIds = (...values: unknown[]): string[] => {
  return Array.from(
    new Set(
      values
        .flatMap((value) => collectStringIds(value))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
};

export const buildAssignedSubaccountFields = (...values: unknown[]) => {
  const assignedSubaccountIds = normalizeAssignedSubaccountIds(...values);

  return {
    assignedSubaccountIds,
    assignedSubaccountId: assignedSubaccountIds[0] || null,
  };
};

export const readAssignedSubaccountIds = (clientLike: {
  assignedSubaccountIds?: unknown;
  assignedSubaccountId?: unknown;
}) => {
  return normalizeAssignedSubaccountIds(
    clientLike?.assignedSubaccountIds,
    clientLike?.assignedSubaccountId
  );
};

export const hasAssignedSubaccount = (
  clientLike: { assignedSubaccountIds?: unknown; assignedSubaccountId?: unknown },
  subaccountId: string,
) => {
  return readAssignedSubaccountIds(clientLike).includes(subaccountId);
};