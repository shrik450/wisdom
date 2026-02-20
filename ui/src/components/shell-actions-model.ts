export interface ShellActionSpec {
  id: string;
  label: string;
  onSelect: () => void;
  priority?: number;
  overflowOnly?: boolean;
  disabled?: boolean;
}

export interface ShellActionContributor {
  contributorId: number;
  registrationOrder: number;
  actions: readonly ShellActionSpec[];
}

export interface ShellActionRegistryState {
  contributors: readonly ShellActionContributor[];
  nextRegistrationOrder: number;
}

export interface ShellResolvedAction extends ShellActionSpec {
  priority: number;
  registrationOrder: number;
  actionOrder: number;
}

function normalizedPriority(priority: number | undefined): number {
  if (priority === undefined) {
    return 0;
  }
  if (!Number.isFinite(priority)) {
    return 0;
  }
  return priority;
}

function normalizedFlag(flag: boolean | undefined): boolean {
  return flag === true;
}

function areActionsEqual(
  first: readonly ShellActionSpec[],
  second: readonly ShellActionSpec[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    const left = first[index];
    const right = second[index];
    if (left.id !== right.id) {
      return false;
    }
    if (left.label !== right.label) {
      return false;
    }
    if (normalizedPriority(left.priority) !== normalizedPriority(right.priority)) {
      return false;
    }
    if (normalizedFlag(left.overflowOnly) !== normalizedFlag(right.overflowOnly)) {
      return false;
    }
    if (normalizedFlag(left.disabled) !== normalizedFlag(right.disabled)) {
      return false;
    }
    if (left.onSelect !== right.onSelect) {
      return false;
    }
  }

  return true;
}

export function createShellActionRegistryState(): ShellActionRegistryState {
  return {
    contributors: [],
    nextRegistrationOrder: 0,
  };
}

export function upsertShellActionContributor(
  state: ShellActionRegistryState,
  contributorId: number,
  actions: readonly ShellActionSpec[],
): ShellActionRegistryState {
  const existingIndex = state.contributors.findIndex((contributor) => {
    return contributor.contributorId === contributorId;
  });

  if (existingIndex >= 0) {
    const existingContributor = state.contributors[existingIndex];
    if (areActionsEqual(existingContributor.actions, actions)) {
      return state;
    }

    const nextContributors = [...state.contributors];
    nextContributors[existingIndex] = {
      ...existingContributor,
      actions: [...actions],
    };
    return {
      ...state,
      contributors: nextContributors,
    };
  }

  return {
    contributors: [
      ...state.contributors,
      {
        contributorId,
        registrationOrder: state.nextRegistrationOrder,
        actions: [...actions],
      },
    ],
    nextRegistrationOrder: state.nextRegistrationOrder + 1,
  };
}

export function removeShellActionContributor(
  state: ShellActionRegistryState,
  contributorId: number,
): ShellActionRegistryState {
  const nextContributors = state.contributors.filter((contributor) => {
    return contributor.contributorId !== contributorId;
  });
  if (nextContributors.length === state.contributors.length) {
    return state;
  }

  return {
    ...state,
    contributors: nextContributors,
  };
}

export function resolveShellActions(
  contributors: readonly ShellActionContributor[],
): ShellResolvedAction[] {
  const seen = new Map<string, number>();
  const resolved: ShellResolvedAction[] = [];

  for (const contributor of contributors) {
    for (let actionOrder = 0; actionOrder < contributor.actions.length; actionOrder += 1) {
      const action = contributor.actions[actionOrder];
      const existingContributorId = seen.get(action.id);
      if (existingContributorId !== undefined) {
        throw new Error(
          `Duplicate shell action id "${action.id}" registered by contributors ${existingContributorId} and ${contributor.contributorId}.`,
        );
      }
      seen.set(action.id, contributor.contributorId);
      resolved.push({
        ...action,
        priority: normalizedPriority(action.priority),
        actionOrder,
        registrationOrder: contributor.registrationOrder,
      });
    }
  }

  resolved.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    if (a.registrationOrder !== b.registrationOrder) {
      return a.registrationOrder - b.registrationOrder;
    }
    if (a.actionOrder !== b.actionOrder) {
      return a.actionOrder - b.actionOrder;
    }
    return a.id.localeCompare(b.id);
  });

  return resolved;
}
