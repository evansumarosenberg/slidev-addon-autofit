export interface AutofitRootDebugAttributes {
  update(measureCount: number, batchId: number): void
  updatePrivateTier(tier: number | null): void
  dispose(): void
}

export function installAutofitRootDebugAttributes(
  root: HTMLElement,
): AutofitRootDebugAttributes {
  return {
    update(measureCount, batchId): void {
      root.setAttribute('data-autofit-measure-count', String(measureCount))
      root.setAttribute('data-autofit-batch-id', String(batchId))
    },

    // This is deliberately a development/test-only seam. Coordinated results
    // remain private until their pair is committed, so their tier cannot use
    // the public presentation attribute while a browser test holds frames.
    updatePrivateTier(tier): void {
      if (tier === null)
        root.removeAttribute('data-autofit-private-tier')
      else
        root.setAttribute('data-autofit-private-tier', String(tier))
    },

    dispose(): void {
      root.removeAttribute('data-autofit-measure-count')
      root.removeAttribute('data-autofit-batch-id')
      root.removeAttribute('data-autofit-private-tier')
    },
  }
}
