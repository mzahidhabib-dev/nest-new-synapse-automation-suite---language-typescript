// src/lead-pipeline/config/ab-test.config.ts

export const ABTestConfig = {
  // Define active experiment configurations running inside the pipeline
  tests: {
    lead_classifier_strategy: {
      enabled: true,
      description: 'Strict BANT compliance (A) vs. Soft Intent Capture (B) for early funnel qualification',
      versionA: 'strict_bant_corporate',
      versionB: 'loose_intent_agile',
    },
    outreach_conversion_style: {
      enabled: false, // Inactive initially; can be enabled via n8n toggle or configuration shifts later
      description: 'Direct Calendar Link CTA (A) vs. Case Study Value-First Document CTA (B)',
      versionA: 'direct_booking_cta',
      versionB: 'value_asset_cta',
    },
  },

  /**
   * Deterministically maps a unique lead signature to experiment Group 'A' or 'B'.
   * Zero external dependencies, ultra-fast bitwise math execution.
   * * @param signature unique identifier (e.g., base64 hash of email snippet or domain string)
   * @param testName name of the active experiment key from the config above
   */
  getGroup(signature: string, testName: string): 'A' | 'B' {
    // Generate a reproducible, pseudo-random integer using string hashing
    const hash = this.hashString(signature + testName);
    
    // Even hashes go to Group A, odd hashes go to Group B
    return hash % 2 === 0 ? 'A' : 'B';
  },

  /**
   * Standard DJB2 bitwise hashing algorithm implementation.
   * Converts variable text data into a stable, non-negative integer.
   */
  hashString(str: string): number {
    let hash = 5381; // Prime seed number chosen to reduce bucket collisions
    
    for (let i = 0; i < str.length; i++) {
      // Bitwise shift and add character code
      hash = (hash << 5) + hash + str.charCodeAt(i);
      hash |= 0; // Convert to a 32-bit signed integer instantly
    }
    
    return Math.abs(hash); // Ensure returned integer value is strictly positive
  },
};