import { type ResolvedAction } from "../actions/action-model";

export type ResolvedCommandAction = Extract<
  ResolvedAction,
  { kind: "command" }
>;

export function filterCommandActions(
  actions: readonly ResolvedCommandAction[],
  query: string,
): ResolvedCommandAction[] {
  const lowerQuery = query.toLowerCase();
  const aliasMatches: ResolvedCommandAction[] = [];
  const labelMatches: ResolvedCommandAction[] = [];

  for (const action of actions) {
    const hasAliasMatch = (action.aliases ?? []).some((alias) => {
      return alias === query;
    });
    const hasLabelMatch = action.label.toLowerCase().includes(lowerQuery);

    if (!hasAliasMatch && !hasLabelMatch) {
      continue;
    }

    if (hasAliasMatch) {
      aliasMatches.push(action);
      continue;
    }

    labelMatches.push(action);
  }

  return [...aliasMatches, ...labelMatches];
}
