FROM node:20-slim

# Install build dependencies for canvas (native module)
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Download face-api models
COPY scripts/ ./scripts/
RUN node scripts/download-models.js

# Copy source and build
COPY . .
RUN npm run build

# Create uploads directory
RUN mkdir -p ./uploads/faces

EXPOSE 3000

CMD ["node", "dist/main"]
