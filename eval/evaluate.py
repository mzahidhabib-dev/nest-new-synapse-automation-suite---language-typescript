import requests
import json
import os
import uuid
import time
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from the root directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("❌ ERROR: GEMINI_API_KEY is not set in the root .env file.")
    exit(1)

# Configure the Judge LLM
genai.configure(api_key=GEMINI_API_KEY)
# Using flash for faster evaluations, or pro for more accurate ones
model = genai.GenerativeModel('gemini-2.5-flash') 

API_URL = "http://localhost:3000/rag/chat"
CLIENT_ID = "tenant-a"

# --- 1. Define Test Dataset ---
# In a real environment, you might load this from a CSV or JSON file.
TEST_CASES = [
    {
        "question": "What is the capital of France?",
        "expected_answer": "Paris"
    },
    {
        "question": "How do you calculate the area of a circle?",
        "expected_answer": "Pi multiplied by the radius squared."
    }
    # Add more domain-specific questions based on the PDFs you uploaded
]

def query_backend(question: str) -> dict:
    """Sends the question to the NestJS RAG backend and retrieves the response."""
    session_id = str(uuid.uuid4())
    headers = {
        "Content-Type": "application/json",
        "x-client-id": CLIENT_ID
    }
    payload = {
        "query": question,
        "sessionId": session_id
    }
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Failed to query backend: {e}")
        return None

def grade_response(question: str, generated_answer: str, expected_answer: str, context: str) -> dict:
    """Uses Gemini to act as a Judge and score the RAG response on 3 metrics."""
    prompt = f"""
    You are an expert AI evaluator grading a Retrieval-Augmented Generation (RAG) system.
    Please evaluate the following system response based on the provided context and question.
    
    [User Question]: {question}
    [Expected Answer]: {expected_answer}
    
    [Retrieved Context (from Vector DB)]:
    {context}
    
    [System Generated Answer]:
    {generated_answer}
    
    Grade the system on the following three metrics using a scale of 1 to 5, where 5 is the best.
    1. Context Relevance: Does the retrieved context contain the information needed to answer the question? (If the context is irrelevant, give a low score).
    2. Faithfulness: Is the generated answer derived strictly from the retrieved context without hallucinating outside information?
    3. Answer Relevance: Does the generated answer successfully and directly address the user's question, matching the expected answer?
    
    Return your evaluation strictly in JSON format matching this schema:
    {{
        "context_relevance": <int>,
        "faithfulness": <int>,
        "answer_relevance": <int>,
        "reasoning": "<brief string explaining the scores>"
    }}
    """
    
    try:
        # Ask Gemini to return JSON
        result = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(response_mime_type="application/json")
        )
        return json.loads(result.text)
    except Exception as e:
        print(f"Failed to grade response: {e}")
        return {
            "context_relevance": 0,
            "faithfulness": 0,
            "answer_relevance": 0,
            "reasoning": f"Error during evaluation: {str(e)}"
        }

def run_evaluation():
    print("🚀 Starting RAG Evaluation...")
    print(f"Testing against backend API: {API_URL}")
    print("-" * 50)
    
    total_scores = {"context_relevance": 0, "faithfulness": 0, "answer_relevance": 0}
    num_tests = len(TEST_CASES)
    
    for i, test in enumerate(TEST_CASES):
        print(f"Test {i+1}/{num_tests}: {test['question']}")
        
        # 1. Get Answer and Context from Backend
        response = query_backend(test['question'])
        if not response:
            print("❌ Skipping due to backend failure.\n")
            continue
            
        generated_answer = response.get('answer', '')
        context_texts = response.get('contextTexts', [])
        
        # Combine all retrieved chunks into a single context string
        full_context = "\n\n".join(context_texts) if context_texts else "NO CONTEXT RETRIEVED."
        
        # 2. Grade the Response using the LLM Judge
        grades = grade_response(
            question=test['question'],
            generated_answer=generated_answer,
            expected_answer=test['expected_answer'],
            context=full_context
        )
        
        # Print results for this test
        print(f"  🤖 AI Answer: {generated_answer[:100]}...")
        print(f"  📊 Context Relevance: {grades['context_relevance']}/5")
        print(f"  📊 Faithfulness:      {grades['faithfulness']}/5")
        print(f"  📊 Answer Relevance:  {grades['answer_relevance']}/5")
        print(f"  💡 Reasoning: {grades['reasoning']}\n")
        
        total_scores["context_relevance"] += grades["context_relevance"]
        total_scores["faithfulness"] += grades["faithfulness"]
        total_scores["answer_relevance"] += grades["answer_relevance"]
        
        # Small delay to avoid API rate limits
        time.sleep(2)
        
    # Print Final Report Card
    print("=" * 50)
    print("🏆 FINAL EVALUATION REPORT CARD 🏆")
    print("=" * 50)
    if num_tests > 0:
        print(f"Average Context Relevance: {total_scores['context_relevance'] / num_tests:.2f} / 5.00")
        print(f"Average Faithfulness:      {total_scores['faithfulness'] / num_tests:.2f} / 5.00")
        print(f"Average Answer Relevance:  {total_scores['answer_relevance'] / num_tests:.2f} / 5.00")
    else:
        print("No tests completed.")

if __name__ == "__main__":
    run_evaluation()
