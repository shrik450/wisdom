import { type ShellResolvedAction } from "./shell-actions-model";

const DEFAULT_ACTION_WIDTH_PX = 96;
const DEFAULT_OVERFLOW_BUTTON_WIDTH_PX = 88;
const DEFAULT_ACTION_GAP_PX = 8;

export interface ShellActionLayoutInput {
  actions: readonly ShellResolvedAction[];
  containerWidth: number;
  buttonWidths: Readonly<Record<string, number>>;
  overflowButtonWidth?: number;
  gapPx?: number;
  mobile: boolean;
}

export interface ShellActionLayout {
  inlineActions: readonly ShellResolvedAction[];
  overflowActions: readonly ShellResolvedAction[];
}

function widthForAction(
  actionId: string,
  buttonWidths: Readonly<Record<string, number>>,
): number {
  const width = buttonWidths[actionId];
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
    return DEFAULT_ACTION_WIDTH_PX;
  }
  return width;
}

export function partitionShellActions(
  input: ShellActionLayoutInput,
): ShellActionLayout {
  if (input.actions.length === 0) {
    return {
      inlineActions: [],
      overflowActions: [],
    };
  }

  if (input.mobile) {
    const firstInlineAction = input.actions.find(
      (action) => !action.overflowOnly,
    );
    if (!firstInlineAction) {
      return {
        inlineActions: [],
        overflowActions: [...input.actions],
      };
    }
    return {
      inlineActions: [firstInlineAction],
      overflowActions: input.actions.filter(
        (action) => action.id !== firstInlineAction.id,
      ),
    };
  }

  const normalizedContainerWidth = Math.max(0, input.containerWidth);
  const gapPx =
    input.gapPx !== undefined &&
    Number.isFinite(input.gapPx) &&
    input.gapPx >= 0
      ? input.gapPx
      : DEFAULT_ACTION_GAP_PX;
  const overflowButtonWidth =
    input.overflowButtonWidth !== undefined &&
    Number.isFinite(input.overflowButtonWidth) &&
    input.overflowButtonWidth > 0
      ? input.overflowButtonWidth
      : DEFAULT_OVERFLOW_BUTTON_WIDTH_PX;

  const forcedOverflowCount = input.actions.filter(
    (action) => action.overflowOnly,
  ).length;
  const inlineCandidates = input.actions.filter(
    (action) => !action.overflowOnly,
  );
  const inlineActions: ShellResolvedAction[] = [];
  let inlineWidth = 0;

  for (let index = 0; index < inlineCandidates.length; index += 1) {
    const action = inlineCandidates[index];
    const actionWidth = widthForAction(action.id, input.buttonWidths);
    const nextInlineWidth =
      inlineActions.length === 0
        ? actionWidth
        : inlineWidth + gapPx + actionWidth;

    const remainingInlineCandidates = inlineCandidates.length - (index + 1);
    const overflowWouldExist =
      forcedOverflowCount > 0 || remainingInlineCandidates > 0;

    let requiredWidth = nextInlineWidth;
    if (overflowWouldExist) {
      requiredWidth += (nextInlineWidth > 0 ? gapPx : 0) + overflowButtonWidth;
    }

    if (requiredWidth <= normalizedContainerWidth) {
      inlineActions.push(action);
      inlineWidth = nextInlineWidth;
      continue;
    }

    break;
  }

  const inlineIds = new Set(inlineActions.map((action) => action.id));
  return {
    inlineActions,
    overflowActions: input.actions.filter(
      (action) => !inlineIds.has(action.id),
    ),
  };
}
