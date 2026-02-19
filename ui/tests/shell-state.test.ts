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
    name: "TOGGLE_FULLSCREEN enters fullscreen and closes sidebar",
    initial: { fullscreen: false, sidebarOpen: true },
    action: { type: "TOGGLE_FULLSCREEN" },
    expected: { fullscreen: true, sidebarOpen: false },
  },
  {
    name: "TOGGLE_FULLSCREEN exits fullscreen and keeps sidebar closed",
    initial: { fullscreen: true, sidebarOpen: false },
    action: { type: "TOGGLE_FULLSCREEN" },
    expected: { fullscreen: false, sidebarOpen: false },
  },
  {
    name: "OPEN_SIDEBAR exits fullscreen first",
    initial: { fullscreen: true, sidebarOpen: false },
    action: { type: "OPEN_SIDEBAR" },
    expected: { fullscreen: false, sidebarOpen: true },
  },
  {
    name: "OPEN_SIDEBAR opens drawer when not fullscreen",
    initial: { fullscreen: false, sidebarOpen: false },
    action: { type: "OPEN_SIDEBAR" },
    expected: { fullscreen: false, sidebarOpen: true },
  },
  {
    name: "CLOSE_SIDEBAR closes the drawer",
    initial: { fullscreen: false, sidebarOpen: true },
    action: { type: "CLOSE_SIDEBAR" },
    expected: { fullscreen: false, sidebarOpen: false },
  },
  {
    name: "CLOSE_SIDEBAR keeps state when drawer is already closed",
    initial: { fullscreen: false, sidebarOpen: false },
    action: { type: "CLOSE_SIDEBAR" },
    expected: { fullscreen: false, sidebarOpen: false },
  },
  {
    name: "TOGGLE_SIDEBAR opens drawer and exits fullscreen",
    initial: { fullscreen: true, sidebarOpen: false },
    action: { type: "TOGGLE_SIDEBAR" },
    expected: { fullscreen: false, sidebarOpen: true },
  },
  {
    name: "TOGGLE_SIDEBAR closes drawer when open",
    initial: { fullscreen: false, sidebarOpen: true },
    action: { type: "TOGGLE_SIDEBAR" },
    expected: { fullscreen: false, sidebarOpen: false },
  },
  {
    name: "ROUTE_CHANGED closes mobile drawer",
    initial: { fullscreen: false, sidebarOpen: true },
    action: { type: "ROUTE_CHANGED" },
    expected: { fullscreen: false, sidebarOpen: false },
  },
  {
    name: "ROUTE_CHANGED keeps fullscreen state",
    initial: { fullscreen: true, sidebarOpen: false },
    action: { type: "ROUTE_CHANGED" },
    expected: { fullscreen: true, sidebarOpen: false },
  },
  {
    name: "ROUTE_CHANGED keeps state when drawer is already closed",
    initial: { fullscreen: false, sidebarOpen: false },
    action: { type: "ROUTE_CHANGED" },
    expected: { fullscreen: false, sidebarOpen: false },
  },
  {
    name: "VIEWPORT_DESKTOP clears mobile drawer flag",
    initial: { fullscreen: false, sidebarOpen: true },
    action: { type: "VIEWPORT_DESKTOP" },
    expected: { fullscreen: false, sidebarOpen: false },
  },
  {
    name: "VIEWPORT_DESKTOP leaves fullscreen unchanged",
    initial: { fullscreen: true, sidebarOpen: false },
    action: { type: "VIEWPORT_DESKTOP" },
    expected: { fullscreen: true, sidebarOpen: false },
  },
  {
    name: "VIEWPORT_DESKTOP keeps state when drawer is already closed",
    initial: { fullscreen: false, sidebarOpen: false },
    action: { type: "VIEWPORT_DESKTOP" },
    expected: { fullscreen: false, sidebarOpen: false },
  },
];

for (const item of cases) {
  test(item.name, () => {
    const nextState = shellReducer(item.initial, item.action);
    assert.deepEqual(nextState, item.expected);
  });
}
