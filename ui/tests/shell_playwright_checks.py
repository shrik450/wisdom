#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "playwright==1.52.0",
#   "pillow==11.3.0",
# ]
# ///

from __future__ import annotations

import argparse
import asyncio
import os
import shutil
import time
from pathlib import Path
from urllib import error, request

from PIL import Image, ImageChops, ImageStat
from playwright.async_api import Browser, Page, async_playwright

DESKTOP_WIDTHS = [1024, 1280, 1440]
MOBILE_WIDTHS = [375, 390, 430]
FULLSCREEN_IDLE_TIMEOUT_MS = 1800
SERVER_START_TIMEOUT_S = 120


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser()
  parser.add_argument("--port", type=int, default=4180)
  parser.add_argument("--update-snapshots", action="store_true")
  parser.add_argument("--snapshot-threshold", type=float, default=0.004)
  return parser.parse_args()


def repo_root() -> Path:
  return Path(__file__).resolve().parents[2]


def snapshot_dirs(root: Path) -> tuple[Path, Path, Path]:
  base = root / "ui" / "tests" / "playwright_snapshots"
  return base / "baseline", base / "current", base / "diff"


async def wait_for_server(base_url: str, timeout_seconds: int) -> None:
  deadline = time.time() + timeout_seconds
  while time.time() < deadline:
    try:
      with request.urlopen(f"{base_url}/ws/", timeout=1) as response:
        if 200 <= response.status < 500:
          return
    except error.URLError:
      pass
    await asyncio.sleep(0.5)
  raise RuntimeError(f"server did not become ready: {base_url}")


async def start_server(root: Path, port: int) -> asyncio.subprocess.Process:
  env = os.environ.copy()
  env["WISDOM_DEV"] = "1"
  env["WISDOM_PORT"] = str(port)
  env["WISDOM_WORKSPACE_ROOT"] = str(root)

  process = await asyncio.create_subprocess_exec(
    "go",
    "run",
    "./cmd/wisdom",
    cwd=str(root / "server"),
    env=env,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.STDOUT,
  )
  return process


async def stop_server(process: asyncio.subprocess.Process) -> None:
  if process.returncode is not None:
    return
  process.terminate()
  try:
    await asyncio.wait_for(process.wait(), timeout=10)
  except asyncio.TimeoutError:
    process.kill()
    await process.wait()


def attach_error_collectors(page: Page, bucket: list[str]) -> None:
  def on_console(message) -> None:
    if message.type == "error":
      bucket.append(f"console error: {message.text}")

  def on_page_error(err) -> None:
    bucket.append(f"page error: {err}")

  page.on("console", on_console)
  page.on("pageerror", on_page_error)


async def wait_for_attr(
  page: Page,
  selector: str,
  attr: str,
  expected: str,
  timeout_ms: int = 4000,
) -> None:
  locator = page.locator(selector)
  deadline = time.time() + (timeout_ms / 1000)
  while time.time() < deadline:
    value = await locator.get_attribute(attr)
    if value == expected:
      return
    await asyncio.sleep(0.05)
  value = await locator.get_attribute(attr)
  raise AssertionError(
    f"expected {selector} [{attr}={expected}], got {value!r}",
  )


async def wait_for_visible(
  page: Page,
  selector: str,
  expected: bool,
  timeout_ms: int = 4000,
) -> None:
  locator = page.locator(selector)
  deadline = time.time() + (timeout_ms / 1000)
  while time.time() < deadline:
    if await locator.is_visible() == expected:
      return
    await asyncio.sleep(0.05)
  visible = await locator.is_visible()
  raise AssertionError(
    f"expected visibility {expected} for {selector}, got {visible}",
  )


async def capture_snapshot(page: Page, out_path: Path) -> None:
  out_path.parent.mkdir(parents=True, exist_ok=True)
  await page.screenshot(path=str(out_path), full_page=True)


def compare_snapshot(
  name: str,
  baseline_dir: Path,
  current_dir: Path,
  diff_dir: Path,
  update_snapshots: bool,
  threshold: float,
) -> None:
  baseline_path = baseline_dir / f"{name}.png"
  current_path = current_dir / f"{name}.png"
  diff_path = diff_dir / f"{name}.png"

  if not current_path.exists():
    raise AssertionError(f"missing current snapshot: {current_path}")

  if update_snapshots or not baseline_path.exists():
    baseline_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(current_path, baseline_path)
    return

  with Image.open(baseline_path) as baseline_image, Image.open(
    current_path,
  ) as current_image:
    if baseline_image.size != current_image.size:
      raise AssertionError(
        f"snapshot size mismatch for {name}: "
        f"{baseline_image.size} != {current_image.size}",
      )

    diff = ImageChops.difference(baseline_image, current_image)
    stat = ImageStat.Stat(diff)
    mean = sum(stat.mean) / (len(stat.mean) * 255.0)
    if mean > threshold:
      diff_path.parent.mkdir(parents=True, exist_ok=True)
      diff.save(diff_path)
      raise AssertionError(
        f"snapshot {name} differs from baseline (mean={mean:.6f})",
      )


async def run_desktop_checks(
  browser: Browser,
  base_url: str,
  width: int,
  current_snapshots_dir: Path,
  console_errors: list[str],
) -> None:
  context = await browser.new_context(viewport={"width": width, "height": 900})
  page = await context.new_page()
  attach_error_collectors(page, console_errors)

  await page.goto(f"{base_url}/ws/", wait_until="networkidle")
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-fullscreen",
    "false",
  )
  await wait_for_visible(page, "[data-testid='desktop-sidebar']", True)
  await wait_for_visible(page, "[data-testid='mobile-menu-button']", False)

  if width == 1024:
    await page.goto(f"{base_url}/ws/ui/src/components/", wait_until="networkidle")
    await wait_for_visible(
      page,
      "[data-testid='desktop-sidebar'] a[href='/ws/ui/src/components/shell.tsx/']",
      True,
    )
    components_toggle = page.locator(
      "[data-testid='desktop-sidebar'] button:has-text('components')",
    ).first
    await wait_for_attr(
      page,
      "[data-testid='desktop-sidebar'] button:has-text('components')",
      "aria-expanded",
      "true",
    )
    controls_attr = await components_toggle.get_attribute("aria-controls")
    if not controls_attr:
      raise AssertionError("expected aria-controls on expanded components toggle")

    await components_toggle.click()
    await wait_for_attr(
      page,
      "[data-testid='desktop-sidebar'] button:has-text('components')",
      "aria-expanded",
      "false",
    )
    if await components_toggle.get_attribute("aria-controls") is not None:
      raise AssertionError("expected aria-controls to be removed when collapsed")
    await wait_for_visible(
      page,
      "[data-testid='desktop-sidebar'] a[href='/ws/ui/src/components/shell.tsx/']",
      False,
    )
    await page.goto(f"{base_url}/ws/", wait_until="networkidle")

  if width == 1280:
    await capture_snapshot(page, current_snapshots_dir / "default-desktop.png")

  await page.locator("[data-testid='fullscreen-toggle-header']").click()
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-fullscreen",
    "true",
  )
  await wait_for_attr(
    page,
    "[data-testid='fullscreen-controls']",
    "data-visible",
    "false",
  )
  await wait_for_visible(page, "[data-testid='fullscreen-toggle-overlay']", False)

  if width == 1280:
    await capture_snapshot(
      page,
      current_snapshots_dir / "fullscreen-hidden-controls.png",
    )

  await page.mouse.move(width // 2, 0)
  await wait_for_attr(
    page,
    "[data-testid='fullscreen-controls']",
    "data-visible",
    "true",
  )
  await wait_for_visible(page, "[data-testid='fullscreen-toggle-overlay']", True)

  if width == 1280:
    await capture_snapshot(
      page,
      current_snapshots_dir / "fullscreen-revealed-controls.png",
    )

  await page.locator("[data-testid='fullscreen-toggle-overlay']").focus()
  await asyncio.sleep((FULLSCREEN_IDLE_TIMEOUT_MS + 350) / 1000)
  await wait_for_attr(
    page,
    "[data-testid='fullscreen-controls']",
    "data-visible",
    "true",
  )

  await page.locator("[data-testid='fullscreen-reveal-strip']").focus()
  await asyncio.sleep((FULLSCREEN_IDLE_TIMEOUT_MS + 350) / 1000)
  await wait_for_attr(
    page,
    "[data-testid='fullscreen-controls']",
    "data-visible",
    "false",
  )

  await page.keyboard.press("Escape")
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-fullscreen",
    "false",
  )

  await context.close()


async def run_mobile_checks(
  browser: Browser,
  base_url: str,
  width: int,
  current_snapshots_dir: Path,
  console_errors: list[str],
) -> None:
  context = await browser.new_context(
    viewport={"width": width, "height": 844},
    is_mobile=True,
    has_touch=True,
  )
  page = await context.new_page()
  attach_error_collectors(page, console_errors)

  await page.goto(f"{base_url}/ws/", wait_until="networkidle")
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-mobile-sidebar-open",
    "false",
  )
  await wait_for_visible(page, "[data-testid='mobile-menu-button']", True)

  if width == 390:
    await capture_snapshot(page, current_snapshots_dir / "default-mobile.png")

  await page.locator("[data-testid='mobile-menu-button']").focus()
  await page.keyboard.press("Enter")
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-mobile-sidebar-open",
    "true",
  )
  await page.keyboard.press("Escape")
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-mobile-sidebar-open",
    "false",
  )

  await page.locator("[data-testid='mobile-menu-button']").click()
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-mobile-sidebar-open",
    "true",
  )
  if width == 390:
    await capture_snapshot(page, current_snapshots_dir / "mobile-drawer-open.png")
  await page.locator("[data-testid='mobile-backdrop']").click(
    force=True,
    position={"x": width - 6, "y": 6},
  )
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-mobile-sidebar-open",
    "false",
  )

  await page.locator("[data-testid='mobile-menu-button']").click()
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-mobile-sidebar-open",
    "true",
  )
  await wait_for_visible(page, "[data-testid='mobile-drawer']", True)

  first_nav_link = page.locator(
    "[data-testid='mobile-drawer'] [data-testid='sidebar-nav'] a",
  ).first
  if await first_nav_link.count() == 0:
    raise AssertionError("missing sidebar links for route change drawer test")
  await first_nav_link.click()
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-mobile-sidebar-open",
    "false",
  )

  await page.locator("[data-testid='fullscreen-toggle-header']").click()
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-fullscreen",
    "true",
  )
  await wait_for_attr(
    page,
    "[data-testid='fullscreen-controls']",
    "data-visible",
    "false",
  )
  await page.locator("[data-testid='fullscreen-reveal-strip']").click(
    position={"x": 6, "y": 1},
  )
  await wait_for_attr(
    page,
    "[data-testid='fullscreen-controls']",
    "data-visible",
    "true",
  )
  await page.keyboard.press("Escape")
  await wait_for_attr(
    page,
    "[data-testid='shell-root']",
    "data-fullscreen",
    "false",
  )

  await context.close()


async def run_checks(args: argparse.Namespace) -> None:
  root = repo_root()
  base_url = f"http://127.0.0.1:{args.port}"
  baseline_dir, current_dir, diff_dir = snapshot_dirs(root)
  shutil.rmtree(current_dir, ignore_errors=True)
  shutil.rmtree(diff_dir, ignore_errors=True)
  current_dir.mkdir(parents=True, exist_ok=True)

  process = await start_server(root, args.port)
  try:
    await wait_for_server(base_url, SERVER_START_TIMEOUT_S)

    console_errors: list[str] = []
    async with async_playwright() as playwright:
      browser = await playwright.chromium.launch()
      for width in DESKTOP_WIDTHS:
        await run_desktop_checks(
          browser,
          base_url,
          width,
          current_dir,
          console_errors,
        )
      for width in MOBILE_WIDTHS:
        await run_mobile_checks(
          browser,
          base_url,
          width,
          current_dir,
          console_errors,
        )
      await browser.close()

    if console_errors:
      raise AssertionError("console errors:\n" + "\n".join(console_errors))

    snapshot_names = [
      "default-desktop",
      "default-mobile",
      "fullscreen-hidden-controls",
      "fullscreen-revealed-controls",
      "mobile-drawer-open",
    ]
    for name in snapshot_names:
      compare_snapshot(
        name=name,
        baseline_dir=baseline_dir,
        current_dir=current_dir,
        diff_dir=diff_dir,
        update_snapshots=args.update_snapshots,
        threshold=args.snapshot_threshold,
      )
  finally:
    await stop_server(process)


def main() -> None:
  args = parse_args()
  asyncio.run(run_checks(args))
  print("Shell Playwright checks passed.")


if __name__ == "__main__":
  main()
