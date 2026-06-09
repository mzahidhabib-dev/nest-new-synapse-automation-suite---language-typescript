import os
import json
import time
import csv
import uuid
import requests
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables from the root directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("❌ ERROR: Missing GEMINI_API_KEY in the root .env file.")
    exit(1)

client = genai.Client(api_key=GEMINI_API_KEY)
API_URL = "http://localhost:3000/rag/chat"
CLIENT_ID = "tenant-a"

def query_backend(question: str) -> dict:
    headers = {"Content-Type": "application/json", "x-client-id": CLIENT_ID}
    payload = {"query": question, "sessionId": str(uuid.uuid4())}
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Failed to query backend: {e}")
        return None

def calculate_ragas_metrics(question: str, generated_answer: str, expected_answer: str, context: str) -> dict:
    prompt = f"""
    You are an expert AI evaluator calculating official RAGAS metrics.
    Evaluate the response based on these three specific metrics, scoring each from 0.0 to 1.0 (where 1.0 is perfect).
    
    [User Question]: {question}
    [Expected Answer (Ground Truth)]: {expected_answer}
    [Retrieved Context]: {context}
    [System Generated Answer]: {generated_answer}
    
    Calculate:
    1. Faithfulness (0.0 - 1.0): Are all the claims made in the System Generated Answer completely inferred from the Retrieved Context? (0.0 if hallucinated, 1.0 if strictly factual to context).
    2. Answer Relevancy (0.0 - 1.0): Does the System Generated Answer directly address the User Question without providing redundant or irrelevant information?
    3. Contextual Recall (0.0 - 1.0): Can the Expected Answer be fully deduced from the Retrieved Context? (Did the search engine retrieve the right data?)
    
    Return ONLY JSON:
    {{
        "faithfulness": <float>,
        "answer_relevancy": <float>,
        "contextual_recall": <float>
    }}
    """
    
    try:
        result = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )
        return json.loads(result.text)
    except Exception as e:
        print(f"Metrics calculation failed: {e}")
        return {"faithfulness": 0.0, "answer_relevancy": 0.0, "contextual_recall": 0.0}

def run():
    print("🚀 Starting Custom RAGAS Evaluation...")
    
    dataset_path = os.path.join(os.path.dirname(__file__), 'golden_dataset.json')
    if not os.path.exists(dataset_path):
        print("❌ ERROR: golden_dataset.json not found.")
        return
        
    with open(dataset_path, 'r', encoding='utf-8') as f:
        dataset = json.load(f)
        
    print(f"Loaded {len(dataset)} Golden Test Cases.")
    
    results = []
    avg = {"faithfulness": 0.0, "answer_relevancy": 0.0, "contextual_recall": 0.0}
    
    for i, test in enumerate(dataset):
        print(f"\nEvaluating {i+1}/{len(dataset)}: {test['question'][:50]}...")
        
        response = query_backend(test['question'])
        if not response:
            continue
            
        gen_answer = response.get('answer', '')
        context_texts = response.get('contextTexts', [])
        full_context = "\n\n".join(context_texts) if context_texts else "NO CONTEXT"
        
        metrics = calculate_ragas_metrics(test['question'], gen_answer, test['answer'], full_context)
        
        print(f"   Faithfulness: {metrics['faithfulness']:.2f}")
        print(f"   Answer Relevancy: {metrics['answer_relevancy']:.2f}")
        print(f"   Contextual Recall: {metrics['contextual_recall']:.2f}")
        
        avg["faithfulness"] += metrics["faithfulness"]
        avg["answer_relevancy"] += metrics["answer_relevancy"]
        avg["contextual_recall"] += metrics["contextual_recall"]
        
        results.append({
            "question": test['question'],
            "expected_answer": test['answer'],
            "generated_answer": gen_answer,
            "faithfulness": metrics['faithfulness'],
            "answer_relevancy": metrics['answer_relevancy'],
            "contextual_recall": metrics['contextual_recall']
        })
        
        time.sleep(5) # Strict rate limiting for free tier
        
    # Generate CSV Report (Bypassing pandas requirement)
    csv_path = os.path.join(os.path.dirname(__file__), 'ragas_report.csv')
    if results:
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=results[0].keys())
            writer.writeheader()
            writer.writerows(results)
            
        n = len(results)
        print("\n" + "="*50)
        print("🏆 CUSTOM RAGAS REPORT CARD 🏆")
        print("="*50)
        print(f"Average Faithfulness:      {avg['faithfulness']/n:.4f}")
        print(f"Average Answer Relevancy:  {avg['answer_relevancy']/n:.4f}")
        print(f"Average Contextual Recall: {avg['contextual_recall']/n:.4f}")
        print(f"\n✅ Detailed CSV report saved to {csv_path}")

if __name__ == "__main__":
    run()
