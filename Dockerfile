FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /app/data

ENV NODE_ENV=production \
    PORT=3000 \
    DB_FILE=/app/data/requests.db

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
