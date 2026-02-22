import assert from "node:assert/strict";
import test from "node:test";
import {
  type ShellAction,
  type ShellState,
  shellReducer,
} from "../src/components/shell-state.ts";

interface ReducerCase {
  name: string;
  initial: ShellState;
  action: ShellAction;
  expected: ShellState;
}

const cases: ReducerCase[] = [
  {
    name: "TOGGLE_FULLSCREEN enters fullscreen and closes nav and palette",
    initial: { fullscreen: false, navOpen: true, paletteOpen: true },
    action: { type: "TOGGLE_FULLSCREEN", isDesktop: true },
    expected: { fullscreen: true, navOpen: false, paletteOpen: false },
  },
  {
    name: "TOGGLE_FULLSCREEN exits fullscreen and restores nav on desktop",
    initial: { fullscreen: true, navOpen: false, paletteOpen: false },
    action: { type: "TOGGLE_FULLSCREEN", isDesktop: true },
    expected: { fullscreen: false, navOpen: true, paletteOpen: false },
  },
  {
    name: "TOGGLE_FULLSCREEN exits fullscreen and keeps nav closed on mobile",
    initial: { fullscreen: true, navOpen: false, paletteOpen: false },
    action: { type: "TOGGLE_FULLSCREEN", isDesktop: false },
    expected: { fullscreen: false, navOpen: false, paletteOpen: false },
  },
  {
    name: "CLOSE_SIDEBAR closes nav",
    initial: { fullscreen: false, navOpen: true, paletteOpen: false },
    action: { type: "CLOSE_SIDEBAR" },
    expected: { fullscreen: false, navOpen: false, paletteOpen: false },
  },
  {
    name: "CLOSE_SIDEBAR keeps state when nav is already closed",
    initial: { fullscreen: false, navOpen: false, paletteOpen: false },
    action: { type: "CLOSE_SIDEBAR" },
    expected: { fullscreen: false, navOpen: false, paletteOpen: false },
  },
  {
    name: "TOGGLE_SIDEBAR opens nav and exits fullscreen",
    initial: { fullscreen: true, navOpen: false, paletteOpen: false },
    action: { type: "TOGGLE_SIDEBAR" },
    expected: { fullscreen: false, navOpen: true, paletteOpen: false },
  },
  {
    name: "TOGGLE_SIDEBAR closes nav when open",
    initial: { fullscreen: false, navOpen: true, paletteOpen: false },
    action: { type: "TOGGLE_SIDEBAR" },
    expected: { fullscreen: false, navOpen: false, paletteOpen: false },
  },
  {
    name: "ROUTE_CHANGED on desktop closes palette without touching nav",
    initial: { fullscreen: false, navOpen: true, paletteOpen: true },
    action: { type: "ROUTE_CHANGED", isDesktop: true },
    expected: { fullscreen: false, navOpen: true, paletteOpen: false },
  },
  {
    name: "ROUTE_CHANGED on mobile closes palette and nav",
    initial: { fullscreen: false, navOpen: true, paletteOpen: true },
    action: { type: "ROUTE_CHANGED", isDesktop: false },
    expected: { fullscreen: false, navOpen: false, paletteOpen: false },
  },
  {
    name: "ROUTE_CHANGED keeps state when nothing is open",
    initial: { fullscreen: true, navOpen: false, paletteOpen: false },
    action: { type: "ROUTE_CHANGED", isDesktop: true },
    expected: { fullscreen: true, navOpen: false, paletteOpen: false },
  },
  {
    name: "ROUTE_CHANGED on mobile closes nav even if palette is closed",
    initial: { fullscreen: false, navOpen: true, paletteOpen: false },
    action: { type: "ROUTE_CHANGED", isDesktop: false },
    expected: { fullscreen: false, navOpen: false, paletteOpen: false },
  },
  {
    name: "OPEN_PALETTE on desktop opens palette and keeps nav state",
    initial: { fullscreen: false, navOpen: true, paletteOpen: false },
    action: { type: "OPEN_PALETTE", isDesktop: true },
    expected: { fullscreen: false, navOpen: true, paletteOpen: true },
  },
  {
    name: "OPEN_PALETTE on mobile opens palette and closes nav",
    initial: { fullscreen: false, navOpen: true, paletteOpen: false },
    action: { type: "OPEN_PALETTE", isDesktop: false },
    expected: { fullscreen: false, navOpen: false, paletteOpen: true },
  },
  {
    name: "CLOSE_PALETTE closes palette",
    initial: { fullscreen: false, navOpen: false, paletteOpen: true },
    action: { type: "CLOSE_PALETTE" },
    expected: { fullscreen: false, navOpen: false, paletteOpen: false },
  },
  {
    name: "CLOSE_PALETTE keeps state when palette is already closed",
    initial: { fullscreen: false, navOpen: false, paletteOpen: false },
    action: { type: "CLOSE_PALETTE" },
    expected: { fullscreen: false, navOpen: false, paletteOpen: false },
  },
];

for (const item of cases) {
  test(item.name, () => {
    const nextState = shellReducer(item.initial, item.action);
    assert.deepEqual(nextState, item.expected);
  });
}
