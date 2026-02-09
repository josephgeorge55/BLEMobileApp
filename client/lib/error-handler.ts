import { Platform } from 'react-native';

/**
 * Sets up global error handlers for React Native/Expo app
 * Handles both JS errors and unhandled promise rejections
 * Logs errors with [GlobalError] prefix but doesn't crash the app
 */
export function setupGlobalErrorHandlers(): void {
  // Handle JS errors and crashes
  const originalHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[GlobalError]', isFatal ? 'FATAL:' : 'ERROR:', error);

    if (!isFatal) {
      // Non-fatal errors are logged but not re-thrown to prevent crash
      return;
    }

    // For fatal errors, call the original handler if it exists
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });

  // Handle unhandled promise rejections
  if (Platform.OS === 'web') {
    // Web platform: use addEventListener for unhandledrejection
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('unhandledrejection', (event) => {
        console.warn('[GlobalError] Unhandled promise rejection:', event.reason);
        // Prevent the app from crashing due to unhandled promise rejection
        event.preventDefault();
      });
    }
  }
  // On native platforms, ErrorUtils.setGlobalHandler typically catches most errors
  // including unhandled promise rejections, so no additional setup is needed
}

/**
 * Sanitizes error messages to be user-friendly
 * Hides internal details and maps common error patterns
 * In development mode, logs the real error to console
 *
 * @param error - Any error type (Error, string, unknown)
 * @returns User-friendly error message
 */
export function sanitizeErrorMessage(error: unknown): string {
  // In dev mode, log the real error for debugging
  if (__DEV__) {
    console.error('[ErrorSanitizer] Real error:', error);
  }

  let errorMessage = '';
  let errorCode = '';

  // Extract message and code from different error types
  if (error instanceof Error) {
    errorMessage = error.message;
    if ('code' in error) {
      errorCode = (error as any).code;
    }
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object') {
    if ('message' in error) {
      errorMessage = String((error as any).message);
    }
    if ('code' in error) {
      errorCode = String((error as any).code);
    }
  }

  const errorLower = errorMessage.toLowerCase();

  // Network errors
  if (
    errorLower.includes('fetch failed') ||
    errorLower.includes('network request failed') ||
    errorLower.includes('timeout') ||
    errorLower.includes('network') ||
    errorLower.includes('connection')
  ) {
    return 'Connection issue. Please check your internet and try again.';
  }

  // Firebase auth errors
  if (errorCode.startsWith('auth/') || errorLower.includes('firebase')) {
    if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password') {
      return 'Invalid email or password.';
    }
    if (errorCode === 'auth/email-already-in-use') {
      return 'This email is already registered.';
    }
    if (errorCode === 'auth/weak-password') {
      return 'Please use a stronger password.';
    }
    if (errorCode === 'auth/network-request-failed') {
      return 'Connection issue. Please check your internet and try again.';
    }
    // Generic auth error
    return 'Authentication failed. Please try again.';
  }

  // BLE/Bluetooth errors
  if (
    errorLower.includes('disconnected') ||
    errorLower.includes('cancelled') ||
    errorLower.includes('bluetooth') ||
    errorLower.includes('ble')
  ) {
    return 'Bluetooth connection lost. Please reconnect your motor.';
  }

  // HTTP status codes
  if (errorLower.includes('401') || errorCode === '401') {
    return 'Please sign in again.';
  }

  if (errorLower.includes('403') || errorCode === '403') {
    return 'Please sign in again.';
  }

  if (errorLower.includes('404') || errorCode === '404') {
    return 'The requested information was not found.';
  }

  if (errorLower.includes('429') || errorCode === '429') {
    return 'Too many requests. Please wait a moment and try again.';
  }

  if (
    errorLower.includes('500') ||
    errorCode.startsWith('5') ||
    errorLower.includes('internal server error')
  ) {
    return 'Something went wrong on our end. Please try again later.';
  }

  // Default fallback
  return 'Something went wrong. Please try again.';
}

/**
 * Wraps a promise with error handling
 * Logs errors with [ErrorHandler] prefix
 * Returns fallback value if provided, otherwise re-throws with sanitized message
 *
 * @param promise - Promise to wrap
 * @param fallback - Optional fallback value to return on error
 * @returns Promise with error handling applied
 */
export async function withErrorHandling<T>(
  promise: Promise<T>,
  fallback?: T
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error('[ErrorHandler]', error);

    if (fallback !== undefined) {
      return fallback;
    }

    // Sanitize and re-throw
    const sanitized = sanitizeErrorMessage(error);
    throw new Error(sanitized);
  }
}
