.PHONY: dev build start test test-contract docker-up docker-down clean

dev:
	npm run dev

build:
	npm run build

start:
	npm start

test:
	npm run lint
	npx tsx tests/civic_registry.ts

test-contract:
	npx tsx tests/civic_registry.ts

docker-up:
	docker-compose up -d --build

docker-down:
	docker-compose down

clean:
	rm -rf dist node_modules/.vite
