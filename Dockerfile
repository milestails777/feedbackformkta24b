FROM node:22-alpine

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/server.js ./
COPY backend/data ./data
COPY Frontend /app/Frontend

EXPOSE 3000
CMD ["npm", "start"]