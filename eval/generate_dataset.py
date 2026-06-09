import os
import json
import time
import psycopg2
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from the root directory
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

DATABASE_URL = os.getenv("DATABASE_URL")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not DATABASE_URL or not GEMINI_API_KEY:
    print("❌ ERROR: Missing DATABASE_URL or GEMINI_API_KEY in the root .env file.")
    exit(1)

genai.configure(api_key=GEMINI_API_KEY)
# We use gemini-1.5-pro for data generation because it's better at complex instruction following
model = genai.GenerativeModel('gemini-1.5-pro')

def fetch_random_chunks(limit=100):
    """Fetches random document chunks from the PostgreSQL database."""
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(DATABASE_URL, sslmode='require')
        cursor = conn.cursor()
        
        # Fetch chunks that are long enough to hold meaningful data
        cursor.execute("""
            SELECT content FROM document_chunks 
            WHERE length(content) > 100 
            ORDER BY RANDOM() 
            LIMIT %s;
        """, (limit,))
        
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return [row[0] for row in rows]
    except Exception as e:
        print(f"Database error: {e}")
        return []

def generate_qa_pair(context: str) -> dict:
    """Uses Gemini to generate a question and answer based purely on the provided context."""
    prompt = f"""
    You are an expert curriculum designer. Your task is to generate a realistic user question 
    and the perfect correct answer based ONLY on the following context.
    
    [Context]:
    {context}
    
    The question should be something a user might actually ask a chatbot about this text.
    The answer MUST be derived strictly from the context, without any outside knowledge.
    
    Return your output strictly as JSON matching this schema:
    {{
        "question": "<string>",
        "answer": "<string>"
    }}
    """
    
    try:
        result = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(response_mime_type="application/json")
        )
        data = json.loads(result.text)
        data["context"] = context # Keep the context for RAGAS evaluation
        return data
    except Exception as e:
        print(f"Failed to generate QA: {e}")
        return None

def run():
    print("🚀 Starting Golden Dataset Generation...")
    
    target_size = 10  # Set to 10 for quick testing. Change to 100+ for production.
    chunks = fetch_random_chunks(target_size)
    
    if not chunks:
        print("❌ No chunks found in the database. Have you uploaded documents?")
        return

    dataset = []
    
    for i, chunk in enumerate(chunks):
        print(f"Generating Q&A {i+1}/{len(chunks)}...")
        qa_pair = generate_qa_pair(chunk)
        
        if qa_pair:
            dataset.append(qa_pair)
            
        time.sleep(2) # Avoid rate limits
        
    # Save the dataset
    output_path = os.path.join(os.path.dirname(__file__), 'golden_dataset.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(dataset, f, indent=4)
        
    print(f"✅ Successfully generated {len(dataset)} test cases!")
    print(f"Saved to: {output_path}")

if __name__ == "__main__":
    run()
