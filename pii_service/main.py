import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

app = FastAPI(title="Synapse PII Service")

# Initialize Presidio engines
# It will automatically use the loaded spaCy model 'en_core_web_lg'
try:
    analyzer = AnalyzerEngine()
    anonymizer = AnonymizerEngine()
except Exception as e:
    print(f"Error initializing Presidio: {e}")
    analyzer = None
    anonymizer = None

class RedactRequest(BaseModel):
    text: str
    language: str = "en"

class RedactResponse(BaseModel):
    original_text: str
    redacted_text: str
    entities_detected: list

@app.post("/redact", response_model=RedactResponse)
async def redact_pii(request: RedactRequest):
    if not analyzer or not anonymizer:
        raise HTTPException(status_code=500, detail="PII Engine not initialized")

    # Define the entities we want to redact
    # E.g., EMAIL_ADDRESS, PHONE_NUMBER, US_SSN, CREDIT_CARD
    entities = ["EMAIL_ADDRESS", "PHONE_NUMBER", "US_SSN", "CREDIT_CARD", "CRYPTO"]

    try:
        # Analyze the text to find PII
        results = analyzer.analyze(
            text=request.text,
            entities=entities,
            language=request.language
        )

        # Anonymize the findings by replacing them with <ENTITY_TYPE>
        anonymized_result = anonymizer.anonymize(
            text=request.text,
            analyzer_results=results
        )

        detected_entities = [res.entity_type for res in results]

        return {
            "original_text": request.text,
            "redacted_text": anonymized_result.text,
            "entities_detected": detected_entities
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "ok", "engine_ready": analyzer is not None}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
