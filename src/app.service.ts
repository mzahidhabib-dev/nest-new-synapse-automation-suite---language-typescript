import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getWelcome() {
    return {
      message: 'Welcome to Synapse Automation Suite API',
      status: 'Online',
      nextStep:
        'Send a POST request to /echo with any JSON body to see it returned.',
      example: {
        url: '/echo',
        method: 'POST',
        body: {
          name: 'Ada Lovelace',
          intent: 'Test deployment',
        },
      },
    };
  }
}
