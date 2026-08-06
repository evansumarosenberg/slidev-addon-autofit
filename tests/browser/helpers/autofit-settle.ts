import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const TERMINAL_STATE = /^(fit|overflow|unsupported|config-error)$/

interface AutofitPublicationSnapshot {
  readonly batchId: string | null
  readonly state: string | null
  readonly tier: string | null
}

export async function waitForAnimationFrames(
  page: Page,
  count = 2,
): Promise<void> {
  await page.evaluate(async (frameCount) => {
    for (let index = 0; index < frameCount; index += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    }
  }, count)
}

export async function waitForPageAssets(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images].map(image => image.decode().catch(() => undefined)),
    )
  })
}

export async function waitForAutofitLifecycleIdle(page: Page): Promise<void> {
  let previous = ''
  await expect.poll(async () => {
    await waitForAnimationFrames(page, 2)
    const current = await page.evaluate(() => {
      const target = window as typeof window & {
        __slidevAutofitDebug?: { readonly snapshot: unknown }
      }
      const roots = [...document.querySelectorAll<HTMLElement>('.autofit')]
        .map(root => ({
          batchId: root.getAttribute('data-autofit-batch-id'),
          pending: root.classList.contains('autofit--pending'),
          state: root.getAttribute('data-autofit-state'),
        }))
      return JSON.stringify({
        debug: target.__slidevAutofitDebug?.snapshot ?? null,
        roots,
      })
    })
    const stable = current === previous
    previous = current
    return stable
  }).toBe(true)
}

async function publicationSnapshot(
  locator: Locator,
): Promise<AutofitPublicationSnapshot> {
  return locator.evaluate(root => ({
    batchId: root.getAttribute('data-autofit-batch-id'),
    state: root.getAttribute('data-autofit-state'),
    tier: root.getAttribute('data-autofit-tier'),
  }))
}

export async function waitForAutofitPublication(
  locator: Locator,
): Promise<void> {
  await expect(locator).toHaveAttribute('data-autofit-state', TERMINAL_STATE)
  await expect(locator).not.toHaveClass(/autofit--pending/)

  let previous = await publicationSnapshot(locator)
  await expect.poll(async () => {
    await waitForAnimationFrames(locator.page(), 2)
    const current = await publicationSnapshot(locator)
    const stable = JSON.stringify(current) === JSON.stringify(previous)
    previous = current
    return stable
  }).toBe(true)
}

export async function waitForNewAutofitPublication(
  locator: Locator,
  previousBatchId: number,
): Promise<void> {
  await expect.poll(async () => {
    const snapshot = await publicationSnapshot(locator)
    const batchId = Number(snapshot.batchId)
    return TERMINAL_STATE.test(snapshot.state ?? '')
      && Number.isFinite(batchId)
      && batchId > previousBatchId
  }).toBe(true)
  await waitForAutofitPublication(locator)
}
