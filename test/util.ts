import os from "node:os";

/**
 * Sanitize a string to be safe for AWS resource names
 * Replaces any characters that aren't alphanumeric, hyphen, or underscore
 */
function sanitizeForAwsResourceName(str: string): string {
  // Replace any character that's not alphanumeric, hyphen, or underscore with a hyphen
  return str.replace(/[^a-zA-Z0-9\-_]/g, "-");
}

/**
 * Branch prefix for resource names to avoid naming conflicts in CI/CD
 *
 * Uses BRANCH_PREFIX environment variable in CI/CD environments
 * Falls back to current user's name in local development
 * Sanitizes to ensure only valid characters for AWS resource names
 */
export const BRANCH_PREFIX = sanitizeForAwsResourceName(
  process.env.BRANCH_PREFIX || os.userInfo().username,
);
