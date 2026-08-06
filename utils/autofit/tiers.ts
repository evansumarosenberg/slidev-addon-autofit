import type {
  AutofitConfig,
  TierCandidate,
  TierSearchMachine,
  TierSearchResult,
} from './types'
import { NEUTRAL_TIER_PERCENT } from './config'

type SearchPhase = 'base' | 'large' | 'small' | 'complete'

function assertSideCount(sideCount: number): void {
  if (!Number.isSafeInteger(sideCount) || sideCount < 0)
    throw new RangeError('tier side count must be a non-negative safe integer')
}

export function getTierScale(tier: number, config: AutofitConfig): number {
  if (!Number.isSafeInteger(tier)
    || tier < -config.smallTiers
    || tier > config.largeTiers) {
    throw new RangeError('tier index is outside the configured safe-integer range')
  }

  return 1 + (tier * config.tierIncrement) / NEUTRAL_TIER_PERCENT
}

export function maximumCandidateMeasurements(sideCount: number): number {
  assertSideCount(sideCount)
  return 1 + Math.ceil(Math.log2(sideCount + 1))
}

function createTierSearchResult(
  tier: number,
  fits: boolean,
  measurementCount: number,
  config: AutofitConfig,
): TierSearchResult {
  return {
    tier,
    scale: getTierScale(tier, config),
    fits,
    overflow: !fits,
    measurementCount,
  }
}

class BaseFirstTierSearch implements TierSearchMachine {
  readonly #config: AutofitConfig
  #phase: SearchPhase = 'base'
  #candidate: TierCandidate | null
  #result: TierSearchResult | null = null
  #measurementCount = 0
  #lower = 0
  #upper = 0
  #best: number | null = null

  constructor(config: AutofitConfig) {
    assertSideCount(config.largeTiers)
    assertSideCount(config.smallTiers)
    this.#config = config
    this.#candidate = this.#makeCandidate(0)
  }

  get candidate(): TierCandidate | null {
    return this.#candidate
  }

  get result(): TierSearchResult | null {
    return this.#result
  }

  record(candidateIndex: number, fits: boolean): void {
    if (!this.#candidate || this.#phase === 'complete')
      throw new Error('tier search has no candidate awaiting a result')
    if (candidateIndex !== this.#candidate.index)
      throw new Error(`tier result does not match current candidate ${this.#candidate.index}`)
    if (typeof fits !== 'boolean')
      throw new TypeError('tier fit result must be a boolean')

    this.#measurementCount += 1

    if (this.#phase === 'base') {
      this.#recordBase(fits)
      return
    }

    this.#recordSide(candidateIndex, fits)
  }

  #recordBase(fits: boolean): void {
    if (fits) {
      if (this.#config.largeTiers === 0) {
        this.#complete(0, true)
        return
      }

      this.#phase = 'large'
      this.#lower = 1
      this.#upper = this.#config.largeTiers
      this.#best = 0
      this.#advance()
      return
    }

    if (this.#config.smallTiers === 0) {
      this.#complete(0, false)
      return
    }

    this.#phase = 'small'
    this.#lower = -this.#config.smallTiers
    this.#upper = -1
    this.#best = null
    this.#advance()
  }

  #recordSide(candidateIndex: number, fits: boolean): void {
    if (fits) {
      this.#best = candidateIndex
      if (candidateIndex === this.#upper) {
        this.#finishSide()
        return
      }
      this.#lower = candidateIndex + 1
    }
    else {
      if (candidateIndex === this.#lower) {
        this.#finishSide()
        return
      }
      this.#upper = candidateIndex - 1
    }

    if (this.#lower > this.#upper) {
      this.#finishSide()
      return
    }

    this.#advance()
  }

  #advance(): void {
    const midpoint = this.#lower + Math.floor((this.#upper - this.#lower) / 2)
    this.#candidate = this.#makeCandidate(midpoint)
  }

  #finishSide(): void {
    if (this.#best !== null) {
      this.#complete(this.#best, true)
      return
    }

    this.#complete(-this.#config.smallTiers, false)
  }

  #complete(tier: number, fits: boolean): void {
    this.#phase = 'complete'
    this.#candidate = null
    this.#result = createTierSearchResult(
      tier,
      fits,
      this.#measurementCount,
      this.#config,
    )
  }

  #makeCandidate(index: number): TierCandidate {
    return {
      index,
      scale: getTierScale(index, this.#config),
    }
  }
}

class FixedTierSearch implements TierSearchMachine {
  readonly #config: AutofitConfig
  #candidate: TierCandidate | null
  #result: TierSearchResult | null = null

  constructor(config: AutofitConfig, tier: number) {
    assertSideCount(config.largeTiers)
    assertSideCount(config.smallTiers)
    this.#config = config
    this.#candidate = {
      index: tier,
      scale: getTierScale(tier, config),
    }
  }

  get candidate(): TierCandidate | null {
    return this.#candidate
  }

  get result(): TierSearchResult | null {
    return this.#result
  }

  record(candidateIndex: number, fits: boolean): void {
    if (!this.#candidate)
      throw new Error('tier search has no candidate awaiting a result')
    if (candidateIndex !== this.#candidate.index)
      throw new Error(`tier result does not match current candidate ${this.#candidate.index}`)
    if (typeof fits !== 'boolean')
      throw new TypeError('tier fit result must be a boolean')

    this.#result = createTierSearchResult(candidateIndex, fits, 1, this.#config)
    this.#candidate = null
  }
}

export function createTierSearch(config: AutofitConfig): TierSearchMachine {
  return new BaseFirstTierSearch(config)
}

export function createFixedTierSearch(
  config: AutofitConfig,
  tier: number,
): TierSearchMachine {
  return new FixedTierSearch(config, tier)
}
