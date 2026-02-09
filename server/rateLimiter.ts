import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  resetAt: number;
  blockedUntil: number;
}

type KeyGenerator = (req: Request) => string;

interface RateLimiterOptions {
  windowMs: number;
  maxAttempts: number;
  keyGenerator: KeyGenerator;
  message: string;
  skipSuccessful?: boolean;
}

/**
 * Creates a generic rate limiter middleware for Express
 * @param options Configuration for the rate limiter
 * @returns Express middleware function
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    maxAttempts,
    keyGenerator,
    message,
    skipSuccessful = false,
  } = options;

  const store = new Map<string, RateLimitEntry>();

  // Cleanup expired entries every 60 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt < now && entry.blockedUntil < now) {
        store.delete(key);
      }
    }
  }, 60000);

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = store.get(key);
    if (!entry) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
        blockedUntil: 0,
      };
      store.set(key, entry);
    }

    // Check if currently blocked
    if (entry.blockedUntil > now) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      res.set("Retry-After", retryAfter.toString());
      return res.status(429).json({
        error: message,
        retryAfter,
      });
    }

    // Reset if window has passed
    if (entry.resetAt < now) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
      entry.blockedUntil = 0;
    }

    if (skipSuccessful) {
      // Wrap res.json to only count on failure
      const originalJson = res.json;
      res.json = function (body) {
        // Check if this is a failure response
        const isFailure = res.statusCode >= 400 || body.error;
        if (isFailure) {
          entry!.count++;
          if (entry!.count >= maxAttempts) {
            entry!.blockedUntil = now + windowMs;
          }
        }
        return originalJson.call(this, body);
      };
    } else {
      entry.count++;
      if (entry.count > maxAttempts) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        res.set("Retry-After", retryAfter.toString());
        return res.status(429).json({
          error: message,
          retryAfter,
        });
      }
    }

    next();
  };
}

/**
 * Helper function to extract client IP from request
 * Handles X-Forwarded-For header for proxied requests
 */
function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
    req.ip ||
    "unknown"
  );
}

/**
 * Rate limiter for user registration
 * Allows 3 attempts per 10 minutes per IP
 */
export const registerRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxAttempts: 3,
  keyGenerator: (req) => getClientIp(req),
  message: "Too many registration attempts. Please try again later.",
});

/**
 * Rate limiter for general API endpoints
 * Allows 100 requests per minute per IP
 */
export const generalApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 100,
  keyGenerator: (req) => getClientIp(req),
  message: "Too many requests. Please slow down.",
});

/**
 * Rate limiter for motor linking
 * Allows 1 request per 10 seconds, keyed by userId from request body (falls back to IP)
 */
export const motorLinkRateLimiter = createRateLimiter({
  windowMs: 10 * 1000, // 10 seconds
  maxAttempts: 1,
  keyGenerator: (req) => {
    const userId = (req.body as any)?.userId;
    return userId || getClientIp(req);
  },
  message: "Please wait before linking another motor.",
});

/**
 * Rate limiter for boat updates
 * Allows 1 request per 30 seconds, keyed by userId from request body (falls back to IP)
 */
export const boatUpdateRateLimiter = createRateLimiter({
  windowMs: 30 * 1000, // 30 seconds
  maxAttempts: 1,
  keyGenerator: (req) => {
    const userId = (req.body as any)?.userId;
    return userId || getClientIp(req);
  },
  message: "Please wait before updating boat information.",
});

/**
 * Custom login rate limiter with progressive lockout
 * - Basic limit: 5 failures per 15 minutes per IP (15-minute block)
 * - Progressive limit: 10 failures per 1 hour per IP (30-minute block)
 */
interface LoginRateLimitEntry {
  shortWindowFailures: number; // Failures in last 15 minutes
  longWindowFailures: number; // Failures in last 1 hour
  shortWindowResetAt: number;
  longWindowResetAt: number;
  blockedUntil: number;
}

const loginStore = new Map<string, LoginRateLimitEntry>();

// Cleanup expired login entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginStore) {
    if (entry.longWindowResetAt < now && entry.blockedUntil < now) {
      loginStore.delete(key);
    }
  }
}, 60000);

export function loginRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const key = getClientIp(req);
  const now = Date.now();

  let entry = loginStore.get(key);
  if (!entry) {
    entry = {
      shortWindowFailures: 0,
      longWindowFailures: 0,
      shortWindowResetAt: now + 15 * 60 * 1000,
      longWindowResetAt: now + 60 * 60 * 1000,
      blockedUntil: 0,
    };
    loginStore.set(key, entry);
  }

  // Check if currently blocked
  if (entry.blockedUntil > now) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
    res.set("Retry-After", retryAfter.toString());
    return res.status(429).json({
      error: "Too many login attempts. Please try again later.",
      retryAfter,
    });
  }

  // Reset windows if they've passed
  if (entry.shortWindowResetAt < now) {
    entry.shortWindowFailures = 0;
    entry.shortWindowResetAt = now + 15 * 60 * 1000;
  }

  if (entry.longWindowResetAt < now) {
    entry.longWindowFailures = 0;
    entry.longWindowResetAt = now + 60 * 60 * 1000;
  }

  // Wrap res.json to track failures
  const originalJson = res.json;
  res.json = function (body) {
    // Check if this is a failure response
    const isFailure = res.statusCode >= 400 || body.error;
    if (isFailure) {
      entry!.shortWindowFailures++;
      entry!.longWindowFailures++;

      // Apply stricter lockout based on which limit is reached
      if (entry!.longWindowFailures >= 10) {
        // Progressive lockout: 30 minutes for 10 failures in 1 hour
        entry!.blockedUntil = Math.max(
          entry!.blockedUntil,
          now + 30 * 60 * 1000
        );
      } else if (entry!.shortWindowFailures >= 5) {
        // Basic rate limit: 15 minutes for 5 failures in 15 minutes
        entry!.blockedUntil = Math.max(
          entry!.blockedUntil,
          now + 15 * 60 * 1000
        );
      }
    }
    return originalJson.call(this, body);
  };

  next();
}

/**
 * Brute force protection middleware for login
 * Tracks failed login attempts per email address
 * After 10 failed attempts within 1 hour, blocks that email for 30 minutes
 */
interface BruteForceEntry {
  failedAttempts: number;
  firstFailureAt: number;
  blockedUntil: number;
}

const bruteForceStore = new Map<string, BruteForceEntry>();

// Cleanup expired brute force entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of bruteForceStore) {
    if (
      entry.firstFailureAt + 60 * 60 * 1000 < now &&
      entry.blockedUntil < now
    ) {
      bruteForceStore.delete(key);
    }
  }
}, 60000);

export function bruteForceProtection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const email = (req.body as any)?.email;
  if (!email) {
    return next();
  }

  const now = Date.now();
  let entry = bruteForceStore.get(email);

  if (!entry) {
    entry = {
      failedAttempts: 0,
      firstFailureAt: now,
      blockedUntil: 0,
    };
    bruteForceStore.set(email, entry);
  }

  // Check if currently blocked
  if (entry.blockedUntil > now) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
    res.set("Retry-After", retryAfter.toString());
    return res.status(429).json({
      error:
        "This account has been temporarily locked due to too many failed attempts. Please try again in 30 minutes.",
      retryAfter,
    });
  }

  // Reset if outside the 1-hour window
  if (entry.firstFailureAt + 60 * 60 * 1000 < now) {
    entry.failedAttempts = 0;
    entry.firstFailureAt = now;
    entry.blockedUntil = 0;
  }

  // Wrap res.json to track failures
  const originalJson = res.json;
  res.json = function (body) {
    // Check if this is a failure (error property or status >= 400)
    const isFailure = res.statusCode >= 400 || body.error;
    if (isFailure) {
      entry!.failedAttempts++;

      // Block for 30 minutes after 10 failed attempts
      if (entry!.failedAttempts >= 10) {
        entry!.blockedUntil = now + 30 * 60 * 1000;
      }
    }
    return originalJson.call(this, body);
  };

  next();
}
