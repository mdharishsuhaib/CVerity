# CVerity API image. Works with docker compose and on Hugging Face Spaces (Docker SDK).
FROM python:3.11-slim

# Hugging Face Spaces run containers as user 1000; use the same user everywhere.
RUN useradd -m -u 1000 user
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/home/user \
    HF_HOME=/home/user/.cache/huggingface \
    PATH=/home/user/.local/bin:$PATH \
    HOST=0.0.0.0 \
    PORT=7860 \
    WEB_CONCURRENCY=2 \
    APP_ENV=production
WORKDIR /app

COPY requirements.txt requirements-ml.txt ./
RUN pip install -r requirements.txt \
 && pip install torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r requirements-ml.txt \
 && python -m spacy download en_core_web_sm

COPY --chown=user:user . .
RUN mkdir -p /app/data && chown -R user:user /app

USER user
# Bake the embedding model into the image so cold starts do not download it.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"
ENV HF_HUB_OFFLINE=1

EXPOSE 7860
CMD ["python", "serve.py"]
