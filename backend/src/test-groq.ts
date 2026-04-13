import { completeText } from './infra/llm.js';
import dotenv from 'dotenv';
dotenv.config();

async function testGroq() {
  console.log('Testing Groq API...');
  try {
    const result = await completeText('Say hello in a very enthusiastic way.');
    console.log('Groq Response:', result);
  } catch (error) {
    console.error('Groq Error:', error);
  }
}

testGroq();
