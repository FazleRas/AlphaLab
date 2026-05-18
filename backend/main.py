from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "AlphaLab backend is live"}