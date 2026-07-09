import { CircuitOpenError } from "@/types/errors";
import { logger } from "@/utils/logger";

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = "CLOSED", // Normal operation - requests pass through
  OPEN = "OPEN", // Failing - requests are rejected
  HALF_OPEN = "HALF_OPEN", // Testing - one request allowed to test recovery
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  recoveryTimeout: number; // Time in ms before trying again
  monitorInterval: number; // Time in ms between state checks
  successThreshold: number; // Successes needed to close from half-open
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  monitorInterval: 10000,
  successThreshold: 2,
};

/**
 * Circuit breaker for preventing cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastStateChange: number = Date.now();
  private config: CircuitBreakerConfig;

  constructor(
    private name: string,
    config?: Partial<CircuitBreakerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldTryRecovery()) {
        this.setState(CircuitState.HALF_OPEN);
      } else {
        throw new CircuitOpenError(
          `Circuit breaker "${this.name}" is open`,
          this.name,
          {
            failureCount: this.failureCount,
            lastFailureTime: new Date(this.lastFailureTime).toISOString(),
            recoveryIn:
              this.config.recoveryTimeout - (Date.now() - this.lastFailureTime),
          },
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.config.successThreshold) {
        logger.info(
          `Circuit breaker "${this.name}" recovered`,
          "circuitBreaker",
          {
            state: CircuitState.CLOSED,
            successCount: this.successCount,
          },
        );
        this.reset();
      }
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      logger.warn(
        `Circuit breaker "${this.name}" re-opened`,
        "circuitBreaker",
        {
          state: CircuitState.OPEN,
          failureCount: this.failureCount,
        },
      );
      this.setState(CircuitState.OPEN);
    } else if (this.failureCount >= this.config.failureThreshold) {
      logger.warn(`Circuit breaker "${this.name}" opened`, "circuitBreaker", {
        state: CircuitState.OPEN,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
      });
      this.setState(CircuitState.OPEN);
    }
  }

  /**
   * Check if we should try recovery
   */
  private shouldTryRecovery(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
  }

  /**
   * Set circuit state
   */
  private setState(state: CircuitState): void {
    this.state = state;
    this.lastStateChange = Date.now();

    if (state === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }
  }

  /**
   * Reset circuit to closed state
   */
  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.lastStateChange = Date.now();
  }

  /**
   * Get current state for monitoring
   */
  getState(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
    timeSinceLastFailure: number | null;
    lastStateChange: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime || null,
      timeSinceLastFailure: this.lastFailureTime
        ? Date.now() - this.lastFailureTime
        : null,
      lastStateChange: this.lastStateChange,
    };
  }

  /**
   * Force reset (for manual recovery)
   */
  forceReset(): void {
    logger.info(`Circuit breaker "${this.name}" force reset`, "circuitBreaker");
    this.reset();
  }
}

/**
 * Circuit breaker manager for multiple origins
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private config: Partial<CircuitBreakerConfig>;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = config || {};
  }

  /**
   * Get or create a circuit breaker for an origin
   */
  getBreaker(origin: string): CircuitBreaker {
    if (!this.breakers.has(origin)) {
      this.breakers.set(origin, new CircuitBreaker(origin, this.config));
    }
    return this.breakers.get(origin)!;
  }

  /**
   * Execute operation with circuit breaker for an origin
   */
  async execute<T>(origin: string, operation: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(origin);
    return breaker.execute(operation);
  }

  /**
   * Get all circuit breaker states for monitoring
   */
  getAllStates(): Record<string, ReturnType<CircuitBreaker["getState"]>> {
    const states: Record<string, ReturnType<CircuitBreaker["getState"]>> = {};

    for (const [origin, breaker] of this.breakers) {
      states[origin] = breaker.getState();
    }

    return states;
  }

  /**
   * Get count of open circuits
   */
  getOpenCircuitCount(): number {
    let count = 0;
    for (const breaker of this.breakers.values()) {
      if (breaker.getState().state === CircuitState.OPEN) {
        count++;
      }
    }
    return count;
  }

  /**
   * Force reset all circuits
   */
  forceResetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceReset();
    }
    logger.info("All circuit breakers force reset", "circuitBreaker");
  }
}

export const httpCircuitBreakers = new CircuitBreakerManager({
  failureThreshold: 5,
  recoveryTimeout: 30000,
  successThreshold: 2,
});
