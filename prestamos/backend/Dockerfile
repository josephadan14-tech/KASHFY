FROM node:22-slim
WORKDIR /app

COPY package*.json ./
# Se instalan también las dependencias de desarrollo porque el API se ejecuta con tsx, igual que en tu PC
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi

COPY tsconfig.json ./
COPY src ./src

USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/server.ts"]
