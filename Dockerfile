FROM node:18-slim

LABEL org.opencontainers.image.source=https://github.com/alexinabox/cursors-backend

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 8080

CMD ["npm", "start"]