FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN python3 scripts/carga_real.py carregar-amostra
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/server.js"]
