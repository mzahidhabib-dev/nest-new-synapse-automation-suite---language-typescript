// config/ab-test.config.ts (new file in your email-automator folder)
export const ABTestConfig = {
    // Active tests
    tests: {
      classifier_tone: {
        enabled: true,
        description: 'Professional (A) vs Empathetic (B) system prompt',
        versionA: 'professional_strict',
        versionB: 'empathetic_warm',
      },
      reply_length: {
        enabled: false,  // Turn on after classifier test
        description: 'Short replies (A) vs Detailed replies (B)',
        versionA: 'short_100_words',
        versionB: 'detailed_200_words',
      },
    },
    
    // Function to determine group for an email
    getGroup(emailId: string, testName: string): 'A' | 'B' {
      // Deterministic based on email ID hash (consistent for same email)
      const hash = this.hashString(emailId + testName);
      return hash % 2 === 0 ? 'A' : 'B';
    },
    
    hashString(str: string): number {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    }
  };