export type ActionHeaderDisplay = "inline" | "overflow" | "palette-only";

export interface ActionBase {
  id: string;
  label: string;
  priority?: number;
  headerDisplay?: ActionHeaderDisplay;
  disabled?: boolean;
}

export interface CommandActionSpec extends ActionBase {
  kind: "command";
  onSelect: (count: number | null) => void;
}

export interface MotionActionSpec extends ActionBase {
  kind: "motion";
  range: (count: number | null, char?: string) => { from: number; to: number };
  awaitChar?: boolean;
}

export interface OperatorActionSpec extends ActionBase {
  kind: "operator";
  apply: (range: { from: number; to: number }) => void;
}

export type ActionSpec =
  | CommandActionSpec
  | MotionActionSpec
  | OperatorActionSpec;

export interface ActionContributor {
  contributorId: number;
  registrationOrder: number;
  actions: readonly ActionSpec[];
}

export interface ActionRegistryState {
  contributors: readonly ActionContributor[];
  nextRegistrationOrder: number;
}

export type ResolvedAction = ActionSpec & {
  priority: number;
  registrationOrder: number;
  actionOrder: number;
};

function normalizedPriority(priority: number | undefined): number {
  if (priority === undefined) {
    return 0;
  }
  if (!Number.isFinite(priority)) {
    return 0;
  }
  return priority;
}

function areActionsEqual(
  first: readonly ActionSpec[],
  second: readonly ActionSpec[],
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
    if (
      normalizedPriority(left.priority) !== normalizedPriority(right.priority)
    ) {
      return false;
    }
    if (left.headerDisplay !== right.headerDisplay) {
      return false;
    }
    if (left.disabled !== right.disabled) {
      return false;
    }
    if (left.kind !== right.kind) {
      return false;
    }

    switch (left.kind) {
      case "command": {
        const rightCommand = right as CommandActionSpec;
        if (left.onSelect !== rightCommand.onSelect) {
          return false;
        }
        break;
      }
      case "motion": {
        const rightMotion = right as MotionActionSpec;
        if (left.range !== rightMotion.range) {
          return false;
        }
        if (left.awaitChar !== rightMotion.awaitChar) {
          return false;
        }
        break;
      }
      case "operator": {
        const rightOperator = right as OperatorActionSpec;
        if (left.apply !== rightOperator.apply) {
          return false;
        }
        break;
      }
    }
  }

  return true;
}

export function createActionRegistryState(): ActionRegistryState {
  return {
    contributors: [],
    nextRegistrationOrder: 0,
  };
}

export function upsertActionContributor(
  state: ActionRegistryState,
  contributorId: number,
  actions: readonly ActionSpec[],
): ActionRegistryState {
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

export function removeActionContributor(
  state: ActionRegistryState,
  contributorId: number,
): ActionRegistryState {
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

export function resolveActions(
  contributors: readonly ActionContributor[],
): ResolvedAction[] {
  const seen = new Map<string, number>();
  const resolved: ResolvedAction[] = [];

  for (const contributor of contributors) {
    for (
      let actionOrder = 0;
      actionOrder < contributor.actions.length;
      actionOrder += 1
    ) {
      const action = contributor.actions[actionOrder];
      const existingContributorId = seen.get(action.id);
      if (existingContributorId !== undefined) {
        throw new Error(
          `Duplicate action id "${action.id}" registered by contributors ${existingContributorId} and ${contributor.contributorId}.`,
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
