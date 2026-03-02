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
    initial: { fullscreen: false, navOpen: true, paletteMode: "search" },
    action: { type: "TOGGLE_FULLSCREEN", isDesktop: true },
    expected: { fullscreen: true, navOpen: false, paletteMode: null },
  },
  {
    name: "TOGGLE_FULLSCREEN exits fullscreen and restores nav on desktop",
    initial: { fullscreen: true, navOpen: false, paletteMode: null },
    action: { type: "TOGGLE_FULLSCREEN", isDesktop: true },
    expected: { fullscreen: false, navOpen: true, paletteMode: null },
  },
  {
    name: "TOGGLE_FULLSCREEN exits fullscreen and keeps nav closed on mobile",
    initial: { fullscreen: true, navOpen: false, paletteMode: null },
    action: { type: "TOGGLE_FULLSCREEN", isDesktop: false },
    expected: { fullscreen: false, navOpen: false, paletteMode: null },
  },
  {
    name: "CLOSE_SIDEBAR closes nav",
    initial: { fullscreen: false, navOpen: true, paletteMode: null },
    action: { type: "CLOSE_SIDEBAR" },
    expected: { fullscreen: false, navOpen: false, paletteMode: null },
  },
  {
    name: "CLOSE_SIDEBAR keeps state when nav is already closed",
    initial: { fullscreen: false, navOpen: false, paletteMode: null },
    action: { type: "CLOSE_SIDEBAR" },
    expected: { fullscreen: false, navOpen: false, paletteMode: null },
  },
  {
    name: "TOGGLE_SIDEBAR opens nav and exits fullscreen",
    initial: { fullscreen: true, navOpen: false, paletteMode: null },
    action: { type: "TOGGLE_SIDEBAR" },
    expected: { fullscreen: false, navOpen: true, paletteMode: null },
  },
  {
    name: "TOGGLE_SIDEBAR closes nav when open",
    initial: { fullscreen: false, navOpen: true, paletteMode: null },
    action: { type: "TOGGLE_SIDEBAR" },
    expected: { fullscreen: false, navOpen: false, paletteMode: null },
  },
  {
    name: "ROUTE_CHANGED on desktop closes palette without touching nav",
    initial: { fullscreen: false, navOpen: true, paletteMode: "command" },
    action: { type: "ROUTE_CHANGED", isDesktop: true },
    expected: { fullscreen: false, navOpen: true, paletteMode: null },
  },
  {
    name: "ROUTE_CHANGED on mobile closes palette and nav",
    initial: { fullscreen: false, navOpen: true, paletteMode: "search" },
    action: { type: "ROUTE_CHANGED", isDesktop: false },
    expected: { fullscreen: false, navOpen: false, paletteMode: null },
  },
  {
    name: "ROUTE_CHANGED keeps state when nothing is open",
    initial: { fullscreen: true, navOpen: false, paletteMode: null },
    action: { type: "ROUTE_CHANGED", isDesktop: true },
    expected: { fullscreen: true, navOpen: false, paletteMode: null },
  },
  {
    name: "ROUTE_CHANGED on mobile closes nav even if palette is closed",
    initial: { fullscreen: false, navOpen: true, paletteMode: null },
    action: { type: "ROUTE_CHANGED", isDesktop: false },
    expected: { fullscreen: false, navOpen: false, paletteMode: null },
  },
  {
    name: "OPEN_PALETTE on desktop opens search mode and keeps nav state",
    initial: { fullscreen: false, navOpen: true, paletteMode: null },
    action: { type: "OPEN_PALETTE", isDesktop: true, mode: "search" },
    expected: { fullscreen: false, navOpen: true, paletteMode: "search" },
  },
  {
    name: "OPEN_PALETTE on desktop opens command mode",
    initial: { fullscreen: false, navOpen: true, paletteMode: null },
    action: { type: "OPEN_PALETTE", isDesktop: true, mode: "command" },
    expected: { fullscreen: false, navOpen: true, paletteMode: "command" },
  },
  {
    name: "OPEN_PALETTE on mobile opens command mode and closes nav",
    initial: { fullscreen: false, navOpen: true, paletteMode: null },
    action: { type: "OPEN_PALETTE", isDesktop: false, mode: "command" },
    expected: { fullscreen: false, navOpen: false, paletteMode: "command" },
  },
  {
    name: "OPEN_PALETTE updates mode while already open",
    initial: { fullscreen: false, navOpen: true, paletteMode: "search" },
    action: { type: "OPEN_PALETTE", isDesktop: true, mode: "command" },
    expected: { fullscreen: false, navOpen: true, paletteMode: "command" },
  },
  {
    name: "CLOSE_PALETTE closes palette",
    initial: { fullscreen: false, navOpen: false, paletteMode: "search" },
    action: { type: "CLOSE_PALETTE" },
    expected: { fullscreen: false, navOpen: false, paletteMode: null },
  },
  {
    name: "CLOSE_PALETTE keeps state when palette is already closed",
    initial: { fullscreen: false, navOpen: false, paletteMode: null },
    action: { type: "CLOSE_PALETTE" },
    expected: { fullscreen: false, navOpen: false, paletteMode: null },
  },
];

for (const item of cases) {
  test(item.name, () => {
    const nextState = shellReducer(item.initial, item.action);
    assert.deepEqual(nextState, item.expected);
  });
}
