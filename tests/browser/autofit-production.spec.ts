import { expect, test } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

function productionAssetText(): string {
  const outputRoot = resolve(process.cwd(), 'test-results/autofit-production')
  const files: string[] = []

  function collect(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory())
        collect(path)
      else if (['.css', '.html', '.js'].includes(extname(entry.name)))
        files.push(path)
    }
  }

  collect(outputRoot)
  return files.map(file => readFileSync(file, 'utf8')).join('\n')
}

test('omits development diagnostics from the served production fixture', async ({ page }) => {
  await page.goto('/32')
  const autofit = page.getByTestId('shared-batch-a')
  await expect(autofit).toHaveAttribute('data-autofit-state', /^(fit|overflow)$/)

  await expect(autofit).not.toHaveAttribute('data-autofit-batch-id')
  await expect(autofit).not.toHaveAttribute('data-autofit-measure-count')
  await expect.poll(() => page.evaluate(() =>
    Object.prototype.hasOwnProperty.call(window, '__slidevAutofitDebug'),
  )).toBe(false)
  await expect.poll(() => page.evaluate(() =>
    Object.prototype.hasOwnProperty.call(window, '__slidevAutofitTestHooks'),
  )).toBe(false)

  const assets = productionAssetText()
  for (const developmentToken of [
    '__slidevAutofitDebug',
    '__slidevAutofitTestHooks',
    '__slidevAutoImageTestHooks',
    'triggerAfterUpdate',
    'triggerFontReady',
    'fontReadyCallbacks',
    'slidev-autofit-test-supersede',
    'slidev-auto-image-test',
    'data-autofit-batch-id',
    'data-autofit-measure-count',
    'data-auto-image-measure-count',
    'candidateMeasurements',
    'discardedJobCount',
    'intrinsicWritePhaseCount',
    'intrinsicReadPhaseCount',
    'compensatedWritePhaseCount',
    'finalReadPhaseCount',
  ]) {
    expect(assets).not.toContain(developmentToken)
  }
})
