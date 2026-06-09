import os
import json
import time
import requests
import pandas as pd
from datasets import Dataset
from dotenv import load_dotenv

# Ragas and Langchain imports
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_recall
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

# Load environment variables from the root directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("❌ ERROR: Missing GEMINI_API_KEY in the root .env file.")
    exit(1)

# Configure the LLM and Embeddings for RAGAS Judge
# We use gemini-1.5-flash for evaluation as it's fast and supported by langchain
llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash",
    google_api_key=GEMINI_API_KEY,
    temperature=0
)
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/embedding-001",
    google_api_key=GEMINI_API_KEY
)

API_URL = "http://localhost:3000/rag/chat"
CLIENT_ID = "tenant-a"

def query_backend(question: str) -> dict:
    """Sends the question to the NestJS RAG backend and retrieves the response."""
    headers = {"Content-Type": "application/json", "x-client-id": CLIENT_ID}
    payload = {"query": question, "sessionId": "eval-session"}
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Failed to query backend: {e}")
        return None

def run_ragas_evaluation():
    print("🚀 Starting Official RAGAS Evaluation...")
    
    # 1. Load the Golden Dataset
    dataset_path = os.path.join(os.path.dirname(__file__), 'golden_dataset.json')
    if not os.path.exists(dataset_path):
        print("❌ ERROR: golden_dataset.json not found. Run generate_dataset.py first.")
        return
        
    with open(dataset_path, 'r', encoding='utf-8') as f:
        golden_dataset = json.load(f)
        
    print(f"Loaded {len(golden_dataset)} test cases from Golden Dataset.")
    
    # 2. Collect System Responses
    data_dict = {
        "question": [],
        "answer": [],
        "contexts": [],
        "ground_truth": []
    }
    
    print("\nQuerying NestJS Backend...")
    for i, test in enumerate(golden_dataset):
        print(f"  Testing {i+1}/{len(golden_dataset)}: {test['question']}")
        
        response = query_backend(test['question'])
        if not response:
            continue
            
        generated_answer = response.get('answer', '')
        context_texts = response.get('contextTexts', [])
        
        data_dict["question"].append(test['question'])
        data_dict["answer"].append(generated_answer)
        data_dict["contexts"].append(context_texts)
        data_dict["ground_truth"].append(test['answer'])
        
        time.sleep(2) # Prevent overwhelming the backend
        
    # 3. Create HuggingFace Dataset
    hf_dataset = Dataset.from_dict(data_dict)
    
    # 4. Run RAGAS Evaluation
    print("\n⚖️ Running RAGAS Metrics (This may take a minute)...")
    
    # Ragas metric instances
    metrics = [
        faithfulness,
        answer_relevancy,
        context_recall
    ]
    
    try:
        result = evaluate(
            dataset=hf_dataset,
            metrics=metrics,
            llm=llm,
            embeddings=embeddings,
            raise_exceptions=False
        )
        
        print("\n" + "="*50)
        print("🏆 OFFICIAL RAGAS REPORT CARD 🏆")
        print("="*50)
        print(result)
        
        # Save to CSV for CI/CD artifacts
        df = result.to_pandas()
        csv_path = os.path.join(os.path.dirname(__file__), 'ragas_report.csv')
        df.to_csv(csv_path, index=False)
        print(f"\n✅ Detailed report saved to {csv_path}")
        
    except Exception as e:
        print(f"\n❌ RAGAS Evaluation failed: {e}")

if __name__ == "__main__":
    run_ragas_evaluation()
