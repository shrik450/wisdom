import { type ResolvedAction } from "./action-model";

const DEFAULT_ACTION_WIDTH_PX = 96;
const DEFAULT_OVERFLOW_BUTTON_WIDTH_PX = 88;
const DEFAULT_ACTION_GAP_PX = 8;

export interface HeaderActionLayoutInput<TAction extends ResolvedAction> {
  actions: readonly TAction[];
  containerWidth: number;
  buttonWidths: Readonly<Record<string, number>>;
  overflowButtonWidth?: number;
  gapPx?: number;
  mobile: boolean;
}

export interface HeaderActionLayout<TAction extends ResolvedAction> {
  inlineActions: readonly TAction[];
  overflowActions: readonly TAction[];
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

export function partitionHeaderActions<TAction extends ResolvedAction>(
  input: HeaderActionLayoutInput<TAction>,
): HeaderActionLayout<TAction> {
  if (input.actions.length === 0) {
    return {
      inlineActions: [],
      overflowActions: [],
    };
  }

  if (input.mobile) {
    const firstInlineAction = input.actions.find(
      (action) => action.headerDisplay === "inline",
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
    (action) => action.headerDisplay !== "inline",
  ).length;
  const inlineCandidates = input.actions.filter(
    (action) => action.headerDisplay === "inline",
  );
  const inlineActions: TAction[] = [];
  let inlineWidth = 0;

  for (let index = 0; index < inlineCandidates.length; index += 1) {
    const action = inlineCandidates[index];
    const actionWidth = widthForAction(action.id, input.buttonWidths);
    const nextInlineWidth =
      inlineActions.length === 0
        ? actionWidth
        : inlineWidth + gapPx + actionWidth;

    // If there will be an overflow "More" button (because of forced-overflow
    // actions or remaining inline candidates that won't fit), reserve its
    // width now so we don't place an inline action that leaves no room for it.
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
